# Sécurité — MediLink AI

## Statut actuel

Étape 16 : Auth + Users (étape 7), Doctors + Specialties + Cities (étape 8),
Availability (étape 9), Appointments (étape 10), dashboard patient (étape
11), dashboard médecin (étape 12), dashboard admin (étape 13 — suspension
de comptes utilisateurs, en plus de la vérification des médecins qui
existait déjà depuis l'étape 8), notifications (étape 14 — in-app + email),
tests approfondis + seed de démonstration (étape 15) et durcissement
sécurité + Docker production + documentation (étape 16 — voir la section
dédiée ci-dessous).

## Authentification

- **Mots de passe** : hachés avec `bcryptjs` (implémentation pure JS, portable
  entre Windows/Linux/Docker sans compilation native), coût 12 en
  développement/production. Jamais stockés ni renvoyés en clair.
- **Access token** : JWT signé (HS256), durée de vie courte (15 minutes par
  défaut, `JWT_ACCESS_EXPIRES_IN`), transmis par le client via l'en-tête
  `Authorization: Bearer <token>`. Contient uniquement `{ sub: userId, role }`.
- **Refresh token** : chaîne aléatoire opaque de 64 octets (PAS un JWT),
  transmise dans un cookie **httpOnly, signé, `sameSite=lax`** (et `secure`
  en production). Seul son hash SHA-256 est stocké en base
  (`RefreshToken.tokenHash`) : une fuite de la base ne permet donc pas de
  rejouer une session. **Rotation à chaque utilisation** (`/api/auth/refresh`
  révoque l'ancien jeton et en émet un nouveau), ce qui limite la fenêtre
  d'exploitation en cas de vol d'un refresh token. La déconnexion
  (`/api/auth/logout`) révoque explicitement le jeton courant.
- **Messages d'erreur génériques** : `/api/auth/login` renvoie le même
  message (`"Identifiants invalides."`) que l'e-mail n'existe pas ou que
  le mot de passe soit incorrect, pour ne pas permettre l'énumération de
  comptes existants.
- **Rate limiting** : 10 tentatives/minute par IP sur `/api/auth/login` et
  `/api/auth/register` (protection contre la force brute et le credential
  stuffing), 30 requêtes/minute par IP sur `/api/auth/refresh` (étape 16 —
  seuil plus généreux car le frontend l'appelle légitimement à chaque
  rechargement de page authentifiée, pas seulement lors d'une connexion
  explicite), 200 requêtes/minute par IP sur le reste de l'API.

## RBAC (contrôle d'accès par rôle)

Trois rôles : `PATIENT`, `DOCTOR`, `ADMIN`. Deux garde-fous Fastify
réutilisables :

- `app.authenticate` : exige un access token JWT valide (sinon 401).
- `app.authorize("ADMIN", ...)` : exige en plus que le rôle de
  l'utilisateur fasse partie de la liste autorisée (sinon 403).

L'inscription publique (`/api/auth/register`) n'autorise que les rôles
`PATIENT` et `DOCTOR` : un compte `ADMIN` ne peut jamais être créé par ce
biais (validation Zod, rejet en 400).

## Protection contre l'IDOR (Insecure Direct Object Reference)

Les routes `GET /api/users/:id` et `PATCH /api/users/:id` vérifient
explicitement, à chaque requête, que l'utilisateur authentifié est soit le
propriétaire de la ressource (`request.user.sub === params.id`), soit
`ADMIN`. Un `PATIENT` ou `DOCTOR` qui tente de lire ou modifier le profil
d'un autre utilisateur en changeant l'id dans l'URL reçoit **403**, sans
aucune information sur l'existence ou le contenu du compte ciblé. Testé
explicitement (voir `apps/api/tests/auth.test.ts`, section « Permissions
inter-utilisateurs »).

## Autorisation sur les profils médecins (étape 8)

Un compte `role=DOCTOR` **n'est pas** automatiquement un médecin vérifié :
son profil (`Doctor.verificationStatus`) démarre à `PENDING` et doit être
explicitement passé à `VERIFIED` par un `ADMIN` avant d'apparaître dans la
recherche publique ou sur `GET /api/doctors/:id`.

- **Auto-vérification impossible** : `PATCH /api/doctors/me` et
  `PATCH /api/doctors/:id` renvoient **403** si le corps de la requête
  contient `verificationStatus` ou `verifiedAt` — y compris pour un
  `ADMIN`, qui doit passer par les routes dédiées
  (`/api/admin/doctors/:id/verify|reject|suspend`). Un `DOCTOR` qui appelle
  directement une route d'administration reçoit également **403** (RBAC).
- **Propriété du profil** : `PATCH /api/doctors/:id` vérifie que
  `Doctor.userId === request.user.sub`, sinon **403** — un médecin ne peut
  modifier que son propre profil, même en connaissant l'id d'un confrère
  (même protection IDOR que sur `/api/users/:id`).
- **Visibilité publique stricte** : `GET /api/doctors` et
  `GET /api/doctors/:id` ne renvoient jamais un médecin dont
  `verificationStatus !== 'VERIFIED'` ou dont le compte utilisateur n'est
  pas `ACTIVE` — un médecin `PENDING`, `REJECTED` ou `SUSPENDED` reçoit
  **404** sur sa propre fiche publique (aucune fuite d'existence), et
  n'apparaît jamais dans les résultats de recherche.

## Autorisation sur les disponibilités (étape 9)

- **Propriété** : `PATCH`/`DELETE /api/doctors/me/availability/:id`
  vérifient que la règle appartient bien au médecin authentifié
  (`Availability.doctorId === son propre Doctor.id`), sinon **403** — un
  médecin ne peut jamais modifier ou supprimer le planning d'un confrère.
- **RBAC** : ces routes exigent le rôle `DOCTOR` ; un `PATIENT` reçoit
  **403** avant même la vérification de propriété.
- **Visibilité publique** : `GET /api/doctors/:id/availability` applique
  la même règle que la fiche médecin — **404** si le médecin n'est pas
  `VERIFIED`+`ACTIVE`, quelles que soient ses règles de disponibilité.

## Anti-double-réservation : deux protections indépendantes et complémentaires

Aucune des deux ne remplace l'autre ; les deux restent en place en
permanence.

1. **Validation métier — `isSlotBookable()`** (`apps/api/src/modules/availability/availability.service.ts`,
   appelée par `POST /api/appointments` depuis l'étape 10) : recalcule les
   créneaux réellement générés par les `Availability` du médecin pour la
   date concernée et vérifie que le `startAt`/`endAt` demandé correspond
   exactement à l'un d'eux, encore libre, pour un médecin `VERIFIED`+`ACTIVE`.
   Empêche de réserver un horaire **arbitraire**, hors planning publié —
   le frontend n'est jamais la source de vérité.
2. **Contrainte PostgreSQL — index unique partiel** :
   ```sql
   CREATE UNIQUE INDEX "appointments_doctor_slot_unique"
   ON "Appointment" ("doctorId", "startAt")
   WHERE status IN ('PENDING', 'CONFIRMED');
   ```
   Empêche deux réservations **concurrentes** du même créneau réel (race
   condition), y compris si l'application tourne sur plusieurs instances.
   Interceptée **localement** dans `appointments.service.ts` (violation
   `P2002` sur `prisma.appointment.create`, jamais via un handler global,
   pour ne pas confondre avec une autre contrainte unique du schéma) et
   traduite en **409**. Garantie testée à deux niveaux : directement via
   Prisma à l'étape 9, puis via deux vraies requêtes HTTP `POST
   /api/appointments` concurrentes à l'étape 10 (`Promise.all` sur le même
   créneau : exactement une réponse `201`, l'autre `409`).

| Protection | Empêche |
|---|---|
| `isSlotBookable()` (application) | Réserver un horaire jamais publié comme disponible |
| Index unique partiel (PostgreSQL) | Deux réservations concurrentes sur le même créneau réel |

## Isolation planning / rendez-vous existants

`Appointment` ne référence **aucune** règle `Availability` (pas de FK).
Modifier, désactiver ou supprimer une disponibilité ne peut donc jamais
altérer un rendez-vous déjà confirmé — garantie structurelle, pas
seulement applicative. Testé explicitement (`apps/api/tests/availability.test.ts`,
« Isolation planning / rendez-vous existants ») : un rendez-vous confirmé
reste strictement inchangé après modification complète des horaires de la
règle qui l'avait initialement rendu réservable.

## Autorisation sur les rendez-vous (étape 10)

- **`patientId` jamais accepté depuis le corps de la requête** :
  `POST /api/appointments` dérive systématiquement le patient de
  `request.user.sub` — un champ `patientId` envoyé dans le corps est
  ignoré (schéma Zod ne le déclare pas), empêchant toute réservation « pour
  le compte » d'un autre patient.
- **Propriété pour l'annulation** : `PATCH /api/appointments/:id/cancel`
  vérifie `appointment.patientId === request.user.sub` (sinon 403) ;
  `PATCH /api/doctors/me/appointments/:id/cancel` vérifie
  `appointment.doctorId === son propre Doctor.id` (sinon 403) — même
  logique de propriété que sur `Availability`/`Doctor`.
- **Machine à états minimale** : une annulation n'est acceptée que depuis
  un rendez-vous encore `CONFIRMED`/`PENDING` et non déjà passé — annuler
  un rendez-vous déjà `CANCELLED` ou déjà passé renvoie **409**. Aucune
  suppression physique n'a lieu : seul `status` change, l'historique est
  conservé.
- **Admin en lecture seule** : `GET /api/admin/appointments` liste tous les
  rendez-vous mais n'offre aucune mutation — même principe que pour
  `Availability` (pas de règle métier n'autorise l'ADMIN à modifier
  arbitrairement un rendez-vous pour le MVP).

## Administration des comptes utilisateurs (étape 13)

- **RBAC** : `PATCH /api/admin/users/:id/suspend|reactivate` exigent le rôle
  `ADMIN` (`app.authorize("ADMIN")`) — un `PATIENT` ou `DOCTOR` reçoit
  **403**.
- **Anti-auto-verrouillage** : un `ADMIN` ne peut pas suspendre son propre
  compte (**403**), ni suspendre un autre compte `ADMIN` (**403**). Aucune
  restriction équivalente sur `reactivate` (réactiver n'est jamais
  dangereux). Le rôle (`role`) d'un utilisateur n'est modifiable par
  **aucune** route — seul le statut de compte (`status`) l'est, et
  seulement par ces deux routes.
- **Révocation de session immédiate** : suspendre un compte révoque
  aussitôt tous ses `RefreshToken` actifs (`revokeAllRefreshTokensForUser`),
  en plus du contrôle `user.status === "ACTIVE"` déjà appliqué à
  `POST /api/auth/login` et `POST /api/auth/refresh` depuis l'étape 7.
  Limite connue : l'access token JWT déjà émis (courte durée, 15 minutes)
  reste valide jusqu'à son expiration naturelle — un vrai blocklist
  d'access tokens serait nécessaire pour une révocation strictement
  instantanée, jugé hors périmètre pour ce MVP.
- **Deux notions de statut totalement indépendantes** : le statut de
  **vérification** d'un profil médecin (`Doctor.verificationStatus` :
  `PENDING`/`VERIFIED`/`REJECTED`/`SUSPENDED`, contrôlé depuis l'étape 8)
  et le statut du **compte** utilisateur (`User.status` :
  `ACTIVE`/`SUSPENDED`, contrôlable depuis l'étape 13) ne sont ni
  fusionnés ni confondus dans l'interface (deux badges, deux colonnes,
  jamais un seul indicateur) — voir `AdminDoctorsTable`/`AdminUsersTable`
  et leurs badges dédiés (`DoctorVerificationBadge`/`UserStatusBadge`).
  Un médecin `VERIFIED` avec un compte `SUSPENDED` reste non réservable
  (testé explicitement, `apps/api/tests/admin-users.test.ts`).

## Notifications (étape 14)

- **IDOR** : `GET /api/notifications/me`, `PATCH /api/notifications/me/:id/read`
  et `PATCH /api/notifications/me/read-all` n'opèrent que sur
  `request.user.sub` — même garde que `/api/users/me`,
  `/api/doctors/me/*`. Tenter de lire/marquer comme lue la notification
  d'un autre utilisateur renvoie **403**, testé explicitement.
- **Aucune fuite d'email** : le module `notifications` interroge lui-même
  `Doctor.user.email`/`Appointment.patient.email` en interne (nécessaire
  pour composer l'email) via ses propres requêtes Prisma, **jamais** via
  les DTOs publics de `appointments.service.ts` — ceux-ci restent
  inchangés et continuent d'exclure l'email de l'autre partie, comme
  avant l'étape 14.
- **Aucune donnée médicale sensible** : ce MVP ne modélise aucune donnée
  médicale (pas de dossier, diagnostic, ordonnance) — le contenu d'une
  notification se limite par construction à des métadonnées de rendez-vous
  (date/heure, nom de l'autre partie). `errorMessage` (détail technique
  d'un échec SMTP) n'est jamais exposé par l'API, consultable uniquement en
  base.
- **Best-effort strict** : une erreur d'envoi email est capturée
  entièrement à l'intérieur du module `notifications` et ne peut jamais
  transformer une réponse `201`/`200` de réservation/annulation en erreur
  — testé explicitement (`apps/api/tests/notifications.test.ts`).
- **Canal EMAIL jamais mélangé avec IN_APP côté utilisateur** :
  `GET /api/notifications/me` ne renvoie que les lignes `IN_APP` ; les
  lignes `EMAIL` sont un journal technique interne, jamais exposées comme
  une notification "visible" côté utilisateur (éviterait un doublon visuel
  du même événement).

## Autres mesures déjà en place

- Validation stricte de toutes les entrées via **Zod** (400 en cas de
  donnée invalide, avec détail des champs en erreur, jamais de stack trace).
- CORS explicite avec `credentials: true` (nécessaire pour le cookie de
  refresh token) ; origine pilotée par `CORS_ORIGIN` (étape 16, liste
  blanche explicite séparée par des virgules) — sans cette variable
  (développement par défaut), l'API reflète l'origine de la requête
  (`origin: true`), comportement historique conservé pour ne rien casser en
  local. **À toujours définir en production.**
- Aucun secret dans le dépôt Git : `.env` est ignoré, seuls des
  `.env.example` avec des valeurs factices sont versionnés.
- Séparation claire des environnements via `.env` par app (`apps/api/.env`,
  `apps/web/.env`).

## Sécurité côté frontend (étapes 11-14)

- **Aucun token en `localStorage`/`sessionStorage`** : l'access token JWT
  vit uniquement en mémoire (`apps/web/lib/token-store.ts`, une variable de
  module, jamais persistée) ; le refresh token reste exclusivement dans le
  cookie httpOnly déjà décrit ci-dessus, jamais lu ni manipulé en
  JavaScript. Une XSS sur le frontend ne peut donc pas exfiltrer un jeton
  persistant.
- **Les garde-fous de route sont des aides UX, pas des frontières de
  sécurité** : `useRequirePatient`/`useRequireDoctor`/`useRequireAdmin`
  redirigent un utilisateur dont le rôle ne correspond pas à l'espace
  visité, mais
  n'empêchent rien côté serveur. Toute la protection réelle — RBAC,
  vérification de propriété (`doctor.userId === request.user.sub`,
  `appointment.doctorId === son propre Doctor.id`, etc.) — est appliquée
  par l'API à chaque requête, indépendamment de ce que montre l'interface.
  Un médecin ne peut donc jamais lire ou modifier les données d'un confrère
  même en modifiant le JavaScript exécuté dans son navigateur : il n'existe
  aucune route `/api/doctors/:id/...` côté médecin, uniquement des routes
  `/me`, qui dérivent systématiquement l'identité du token authentifié.
- **Le dashboard médecin (étape 12) n'utilise que des routes `/me`** :
  `GET/PATCH /api/doctors/me`, `GET/POST/PATCH/DELETE
  /api/doctors/me/availability(/:id)`, `GET /api/doctors/me/appointments`,
  `PATCH /api/doctors/me/appointments/:id/cancel` — jamais d'endpoint
  paramétré par un id de médecin arbitraire, éliminant par construction
  toute possibilité d'IDOR depuis cette interface.
- **Aucun contrôle de vérification côté médecin** : l'interface
  (`VerificationStatusBanner`) n'affiche que la valeur de
  `verificationStatus` renvoyée par l'API et ne propose aucune action pour
  la modifier — cohérent avec le 403 déjà en place côté API sur toute
  tentative d'auto-modification de ce champ.
- **La cloche de notifications (étape 14) n'utilise que `/api/notifications/me*`** :
  aucun endpoint paramétré par un id de destinataire arbitraire, visible
  pour tout rôle authentifié (PATIENT/DOCTOR/ADMIN) mais chacun ne voit
  jamais que ses propres notifications, la sécurité réelle restant portée
  par l'API (voir section dédiée ci-dessus).

## Durcissement de l'étape 16

Réalisé à la suite d'un audit de sécurité complet (voir la proposition
technique validée avant implémentation) :

- **Dépendance `fast-jwt` critique corrigée** : `@fastify/jwt` était bloqué
  en `^9.x`, qui dépend d'une version de `fast-jwt` (≤ 6.2.3) affectée par
  plusieurs CVE critiques (confusion d'algorithme, contournement HMAC vide,
  ReDoS). Mise à jour contrôlée vers `@fastify/jwt@^10.2.2`
  (`fast-jwt@6.3.3`, non affecté) — vérifiée compatible avec Fastify 5 par
  `tsc` + la suite complète (166 tests) sans aucune adaptation de code
  nécessaire au-delà du numéro de version.
- **CORS restreignable en production** : voir ci-dessus (`CORS_ORIGIN`).
- **Rate limit dédié sur `/api/auth/refresh`** : voir ci-dessus (30/min).
- **Redaction des logs** : le logger Fastify/pino masque explicitement
  `req.headers.authorization`, `req.headers.cookie` et
  `res.headers["set-cookie"]` (remplacés par `[REDACTED]`), avec des
  sérialiseurs personnalisés qui incluent désormais les en-têtes (utile
  pour le débogage) — sans cette personnalisation, la redaction serait
  restée inerte, le sérialiseur par défaut de Fastify n'incluant pas les
  en-têtes. Vérifié par un test de bout en bout qui capture la sortie réelle
  du logger sur une requête authentifiée et une connexion posant un cookie.
- **En-têtes de sécurité HTTP** : `X-Content-Type-Options: nosniff` et
  `Referrer-Policy: no-referrer` sur toute réponse ;
  `Strict-Transport-Security` uniquement quand la requête est réellement
  reçue en HTTPS (jamais annoncé à tort en HTTP simple). Implémentés à la
  main (`apps/api/src/plugins/security-headers.ts`), sans dépendance
  supplémentaire — le besoin ne justifiait pas d'introduire Helmet.
- **Cookie de refresh en production** : `secure: true` s'active
  correctement dès que `NODE_ENV=production` (déjà le cas depuis l'étape 7)
  — le point manquant était que la pile Docker de **développement** ne doit
  jamais forcer `NODE_ENV=production` (elle ne le fait pas) et que la pile
  de **production** (`docker-compose.prod.yml`, étape 16) le fait
  systématiquement, elle.

## Mesures prévues (au-delà du MVP)

Chiffrement des données sensibles si nécessaire, journalisation des
actions sensibles (`AuditLog`), principe du moindre privilège pour les
futurs rôles `Structure de santé`, en-têtes de sécurité plus avancés
(CSP avec nonces pour le frontend), migration de `packages/config` vers un
outillage ESLint/TS réellement partagé si le monorepo grandit. Voir
`docs/deployment/README.md` pour la séparation dev/démo/production déjà en
place au niveau infrastructure depuis l'étape 16.
