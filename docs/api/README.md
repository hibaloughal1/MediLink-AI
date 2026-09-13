# API — MediLink AI

## Statut actuel

Étape 10 : modules **Auth + Users** (étape 7), **Doctors + Specialties +
Cities** (étape 8), **Availability** (étape 9) et **Appointments**. Tous
les endpoints ci-dessous sont implémentés et testés (voir `apps/api/tests/`).

Les dashboards patient (étape 11) et médecin (étape 12) sont des
consommateurs purement frontend de cette même API, sans aucune route ni
migration ajoutée pour les construire. L'étape 13 (Dashboard Admin) ajoute
deux routes d'administration des comptes utilisateurs
(suspension/réactivation) et deux filtres optionnels rétrocompatibles sur
des listes existantes. L'étape 14 (Notifications) ajoute le module
`notifications` (in-app + email, sur réservation/annulation/rappel) — voir
la section dédiée ci-dessous.

## Health (étape 6)

| Méthode | Endpoint | Usage |
|---|---|---|
| GET | `/health` | Confirme que le serveur Fastify répond. |
| GET | `/health/db` | Confirme que la connexion PostgreSQL via Prisma fonctionne. |

## Auth (`/api/auth`)

| Méthode | Endpoint | Auth requise | Usage |
|---|---|---|---|
| POST | `/api/auth/register` | non | Crée un compte `PATIENT` ou `DOCTOR`. `ADMIN` est refusé (400). |
| POST | `/api/auth/login` | non | Vérifie les identifiants, renvoie un access token (JSON) + pose un cookie httpOnly de refresh token. |
| POST | `/api/auth/refresh` | cookie de refresh | Fait tourner (rotation) le refresh token et renvoie un nouvel access token. |
| POST | `/api/auth/logout` | access token + cookie de refresh | Révoque le refresh token courant et efface le cookie. |

`register` et `login` sont soumis à une limite de 10 requêtes/minute par IP
(protection anti force brute), indépendante de la limite globale de l'API
(200 req/min).

### Corps attendu

- `register` : `{ email, password (>= 8 caractères), firstName, lastName, phone? , role? ("PATIENT" | "DOCTOR", défaut "PATIENT") }`
- `login` : `{ email, password }`

### Réponses d'erreur génériques

- Identifiants invalides (mauvais mot de passe OU utilisateur inexistant OU
  compte suspendu) → **401** avec le même message générique
  `"Identifiants invalides."` (pas d'énumération de comptes possible).
- E-mail déjà utilisé → **409**.
- Corps de requête invalide (Zod) → **400** avec le détail des champs en erreur.

## Users (`/api/users`, toutes les routes nécessitent un access token)

| Méthode | Endpoint | Autorisation | Usage |
|---|---|---|---|
| GET | `/api/users/me` | utilisateur connecté | Profil de l'utilisateur courant. |
| PATCH | `/api/users/me` | utilisateur connecté | Met à jour `firstName`/`lastName`/`phone`. |
| GET | `/api/users` | `ADMIN` uniquement | Liste paginée des utilisateurs (`?page=&pageSize=&role=&status=`, `role`/`status` optionnels, étape 13). |
| GET | `/api/users/:id` | soi-même ou `ADMIN` | Profil d'un utilisateur donné. |
| PATCH | `/api/users/:id` | soi-même ou `ADMIN` | Met à jour le profil d'un utilisateur donné (jamais le rôle ni le statut). |

Toute tentative d'un utilisateur non-ADMIN d'accéder à `/api/users/:id` ou
`/api/users` avec un id qui n'est pas le sien renvoie **403** — voir
`docs/security/README.md` pour le détail de cette protection (IDOR).

## Administration des comptes utilisateurs (`/api/admin/users`, ADMIN uniquement, étape 13)

| Méthode | Endpoint | Usage |
|---|---|---|
| PATCH | `/api/admin/users/:id/suspend` | Passe `User.status` à `SUSPENDED` et révoque immédiatement tous ses refresh tokens actifs (déconnexion forcée de toutes ses sessions). |
| PATCH | `/api/admin/users/:id/reactivate` | Repasse `User.status` à `ACTIVE`. |

Ne modifie **jamais** le rôle (`role`) ni aucun autre champ de profil — ces
routes ne portent que la transition `ACTIVE`/`SUSPENDED`, à l'image de
`/api/admin/doctors/:id/verify|reject|suspend` qui ne porte que
`verificationStatus`.

Règles métier :
- **404** si l'utilisateur ciblé n'existe pas.
- **403** `suspend` sur son propre compte (`"Vous ne pouvez pas suspendre votre propre compte."`).
- **403** `suspend` ciblant un compte `ADMIN` (`"Impossible de suspendre un compte administrateur."`).
- **409** `suspend` sur un compte déjà `SUSPENDED`, ou `reactivate` sur un compte déjà `ACTIVE`.
- `reactivate` n'a aucune restriction d'auto-application ni de rôle cible (seul `suspend` est protégé).

Un compte `SUSPENDED` ne peut plus se connecter (`POST /api/auth/login` →
**401**, même message générique que des identifiants invalides) ni
rafraîchir son access token (`POST /api/auth/refresh` → **401**) — ce
contrôle existait déjà depuis l'étape 7 ; la nouveauté de l'étape 13 est de
rendre `status` atteignable via une route ADMIN, et de révoquer
explicitement les refresh tokens existants au moment de la suspension
plutôt que d'attendre leur rejet implicite au prochain refresh.

## Doctors (`/api/doctors`)

| Méthode | Endpoint | Auth requise | Usage |
|---|---|---|---|
| GET | `/api/doctors` | non (public) | Recherche : `?specialty=&city=&search=&page=&limit=`. Ne renvoie que les médecins `VERIFIED` avec un compte `ACTIVE`. |
| GET | `/api/doctors/:id` | non (public) | Fiche d'un médecin — **404** s'il n'est pas `VERIFIED`/`ACTIVE` (aucune fuite d'existence). |
| GET | `/api/doctors/me` | `DOCTOR` | Profil professionnel complet de l'utilisateur courant (404 si non créé). |
| POST | `/api/doctors` | `DOCTOR` | Crée le profil professionnel (statut initial `PENDING`). 409 si déjà existant. |
| PATCH | `/api/doctors/me` | `DOCTOR` | Met à jour son propre profil (`cityId`, `address`, `bio`, `professionalPhone`, `licenseNumber`, `specialtyIds`). |
| PATCH | `/api/doctors/:id` | `DOCTOR` (soi-même) ou `ADMIN` | Même mise à jour, sur un id explicite — 403 si ce n'est pas son propre profil et qu'on n'est pas `ADMIN`. |

Sur `PATCH /me` et `PATCH /:id` : toute tentative d'envoyer
`verificationStatus` ou `verifiedAt` dans le corps de la requête renvoie
**403**, y compris pour un `ADMIN` — ces champs ne sont modifiables que
via les routes d'administration ci-dessous.

Corps de `POST`/`PATCH` : `{ cityId (uuid), address, bio?, professionalPhone?, licenseNumber?, specialtyIds: uuid[] }`
(au moins une spécialité requise à la création). `cityId`/`specialtyIds`
inexistants → **400**.

## Administration des médecins (`/api/admin/doctors`, ADMIN uniquement)

| Méthode | Endpoint | Usage |
|---|---|---|
| GET | `/api/admin/doctors` | Liste paginée de **tous** les médecins, quel que soit leur statut. `?status=PENDING\|VERIFIED\|REJECTED\|SUSPENDED` filtre optionnellement (étape 13, rétrocompatible). |
| PATCH | `/api/admin/doctors/:id/verify` | Passe le médecin en `VERIFIED` (renseigne `verifiedAt`), le rend réservable/visible publiquement. |
| PATCH | `/api/admin/doctors/:id/reject` | Passe le médecin en `REJECTED`. |
| PATCH | `/api/admin/doctors/:id/suspend` | Passe le médecin en `SUSPENDED` (retiré de la recherche publique). |

Ces trois transitions ne modifient que `verificationStatus`/`verifiedAt` —
aucun champ de profil (`bio`, `address`, `professionalPhone`,
`specialtyIds`, `cityId`, `licenseNumber`) n'est modifiable par l'ADMIN via
ces routes ni via aucune autre route admin ; il n'existe volontairement
aucune route d'édition complète du profil médecin côté administration.

**Distinction importante** : `Doctor.verificationStatus` (ce statut) et
`User.status` (`ACTIVE`/`SUSPENDED`, voir la section admin des utilisateurs
ci-dessous) sont deux notions indépendantes. Un médecin `VERIFIED` dont le
compte utilisateur est mis à `SUSPENDED` (via `/api/admin/users/:id/suspend`)
redevient **immédiatement non visible publiquement et non réservable**
(`GET /api/doctors`, `GET /api/doctors/:id` et
`GET /api/doctors/:id/availability` exigent déjà `verificationStatus ===
"VERIFIED" ET user.status === "ACTIVE"` depuis l'étape 8/9 — comportement
inchangé, seulement testé explicitement à l'étape 13). Réactiver le compte
(`/api/admin/users/:id/reactivate`) suffit à le rendre de nouveau visible,
sans repasser par `/api/admin/doctors/:id/verify`.

## Annuaires publics

| Méthode | Endpoint | Usage |
|---|---|---|
| GET | `/api/specialties` | Liste des spécialités (id, name), triée par nom. |
| GET | `/api/cities` | Liste des villes (id, name), triée par nom. |

## Availability

### Gestion par le médecin (`/api/doctors/me/availability`, DOCTOR uniquement)

| Méthode | Endpoint | Usage |
|---|---|---|
| GET | `/api/doctors/me/availability` | Liste ses propres règles (RECURRING + DATE_OVERRIDE), quel que soit son statut de vérification. |
| POST | `/api/doctors/me/availability` | Crée une règle. **409** si chevauchement (horaire ET période d'application) avec une règle existante, ou si une `DATE_OVERRIDE` existe déjà pour cette date. **400** si incohérence (heures, durée, dates). |
| PATCH | `/api/doctors/me/availability/:id` | Met à jour une règle (fusionnée avec les valeurs existantes puis revalidée). **404** si elle n'existe pas, **403** si elle appartient à un autre médecin. |
| DELETE | `/api/doctors/me/availability/:id` | Supprime une règle. Mêmes codes 404/403. |

Corps `POST` (discriminé par `type`) :
- `RECURRING` : `{ type: "RECURRING", dayOfWeek (0-6), startTime ("HH:mm"), endTime, slotDurationMinutes (5-240), effectiveFrom ("YYYY-MM-DD", obligatoire), effectiveTo? }`
- `DATE_OVERRIDE` : `{ type: "DATE_OVERRIDE", specificDate ("YYYY-MM-DD") }` — bloque toute la journée indiquée.

`PATCH` accepte les mêmes champs que le type existant de la règle (sans `type`, non modifiable), tous optionnels.

### Consultation publique (`/api/doctors/:id/availability`)

| Méthode | Endpoint | Usage |
|---|---|---|
| GET | `/api/doctors/:id/availability?from=&to=` | Créneaux **calculés** (pas les règles brutes), uniquement si le médecin est `VERIFIED`+`ACTIVE` (sinon 404). `from`/`to` au format `YYYY-MM-DD`, `from <= to`, écart maximum 60 jours. |

Réponse : `{ doctorId, from, to, slots: [{ startAt, endAt }] }` en ISO-8601 UTC.

## Appointments

### Patient (`/api/appointments`, PATIENT uniquement)

| Méthode | Endpoint | Usage |
|---|---|---|
| POST | `/api/appointments` | Réserve un créneau. `{ doctorId, startAt, endAt }` (ISO-8601 UTC, repris tels quels de `GET .../availability`). `patientId` n'est jamais lu dans le corps — toujours `request.user.sub`. Statut créé directement `CONFIRMED`. |
| GET | `/api/appointments/me` | Liste paginée (`?page=&limit=`) de ses propres rendez-vous, triés par `startAt` décroissant. |
| PATCH | `/api/appointments/:id/cancel` | Annule un de ses propres rendez-vous → `status: CANCELLED` (jamais de suppression physique). |

Erreurs de création : **404** médecin introuvable · **409** créneau non réservable (`isSlotBookable` renvoie `false` : médecin non `VERIFIED`/`ACTIVE`, horaire hors planning, ou déjà passé) · **409** créneau pris entre-temps par une autre requête concurrente (violation de l'index unique partiel, interceptée localement) · **400** corps invalide.

### Médecin (`/api/doctors/me/appointments`, DOCTOR uniquement — cohérent avec `/api/doctors/me/availability`)

| Méthode | Endpoint | Usage |
|---|---|---|
| GET | `/api/doctors/me/appointments` | Agenda paginé de ses propres rendez-vous. |
| PATCH | `/api/doctors/me/appointments/:id/cancel` | Annule un rendez-vous de son propre agenda (`status: CANCELLED`). **403** si le rendez-vous appartient à un autre médecin. |

**Limitation connue (étape 12)** : cette route ne supporte aucun filtre par
date (`from`/`to`), seulement `page`/`limit`. Le dashboard médecin
(`/doctor/appointments`) l'utilise avec `limit=100` mais affiche un message
explicite si `total > limit` plutôt que de présenter silencieusement une
page partielle comme l'agenda complet. Un vrai agenda filtrable par
période nécessiterait d'ajouter `from`/`to` à cette route — non fait à
cette étape pour ne pas modifier l'API sans validation préalable.

### Admin (`/api/admin/appointments`, lecture seule)

| Méthode | Endpoint | Usage |
|---|---|---|
| GET | `/api/admin/appointments` | Liste paginée de **tous** les rendez-vous, tous médecins/patients confondus. Aucune mutation (pas de règle métier ne l'autorise pour le MVP, même philosophie que l'administration des disponibilités). |

### Règles d'annulation communes

Annulable uniquement depuis `CONFIRMED` (ou `PENDING`, inutilisé pour le
MVP) et uniquement si `startAt` n'est pas déjà passé — sinon **409**
(`"Ce rendez-vous ne peut plus être annulé."`).

`COMPLETED` et `NO_SHOW` restent dans l'enum `AppointmentStatus` pour une
évolution future, mais aucune route ne les positionne à cette étape.

## Notifications (`/api/notifications`, étape 14)

Toutes les routes nécessitent un access token (tout rôle : PATIENT, DOCTOR
ou ADMIN) ; chacune n'opère que sur les notifications de l'appelant
(`request.user.sub`), jamais sur un id de destinataire arbitraire.

| Méthode | Endpoint | Usage |
|---|---|---|
| GET | `/api/notifications/me` | Liste paginée des notifications **`IN_APP`** de l'appelant (`?page=&limit=&unreadOnly=true\|false`). Les lignes `EMAIL` (journal technique d'envoi) ne sont jamais renvoyées ici. |
| PATCH | `/api/notifications/me/:id/read` | Marque une notification comme lue. **403** si elle appartient à un autre utilisateur, **404** si elle n'existe pas. Idempotent (rejouer sur une notification déjà lue renvoie 200 sans erreur). |
| PATCH | `/api/notifications/me/read-all` | Marque toutes les notifications `IN_APP` non lues de l'appelant comme lues. Renvoie `{ updated: <nombre> }`. |

### Événements déclencheurs

Aucune route existante n'est renommée ou re-typée : les déclencheurs
s'ajoutent en fin de traitement de `POST /api/appointments`,
`PATCH /api/appointments/:id/cancel` et
`PATCH /api/doctors/me/appointments/:id/cancel`, une fois la mutation déjà
réussie.

| Événement | Destinataires notifiés (IN_APP + EMAIL) |
|---|---|
| Réservation confirmée | Le patient **et** le médecin |
| Annulation par le patient | Le médecin **uniquement** (jamais le patient, auteur de l'action) |
| Annulation par le médecin | Le patient **uniquement** (jamais le médecin, auteur de l'action) |
| Rappel de rendez-vous (~24h avant) | Le patient uniquement |

### Best-effort et gestion des erreurs

L'envoi email est strictement best-effort : une erreur SMTP (y compris un
timeout) est capturée entièrement à l'intérieur du module `notifications`
et **ne peut jamais** faire échouer la réservation ou l'annulation
sous-jacente — la réponse reste `201`/`200` dans tous les cas. En cas
d'échec, la ligne `Notification` correspondante passe à `status: FAILED`
avec `errorMessage` (jamais exposé par l'API, consultable uniquement en
base pour le support/debug). Le transport SMTP applique un timeout de
connexion/envoi de 5 secondes pour qu'un serveur SMTP lent ou injoignable
ne retarde jamais indéfiniment la requête HTTP.

Sans `SMTP_HOST` configuré, l'API utilise un transport "no-op" : les
notifications `IN_APP` fonctionnent normalement, aucun email n'est
réellement envoyé (ni tenté), et aucune notification `EMAIL` ne passe donc
jamais en `FAILED` faute de configuration — comportement par défaut en
dev/CI. Voir `docs/architecture/README.md` pour le détail du transport et
Mailpit (dev uniquement).

### Idempotence

Chaque notification est identifiée par `(userId, appointmentId, type,
channel)`, contrainte unique **PostgreSQL** (pas seulement une vérification
applicative) : une tentative de création en doublon échoue avec l'erreur
Prisma `P2002`, capturée et traitée comme "déjà fait, rien à refaire". Ce
mécanisme protège aussi bien les déclencheurs de réservation/annulation
(appels concurrents) que le scheduler de rappel (relances, redémarrage de
l'API — aucun état n'est gardé en mémoire du process).

### Scheduler de rappel

In-process, démarré dans `apps/api/src/app.ts` (`setInterval`, toutes les
`REMINDER_CHECK_INTERVAL_MS` — 15 minutes par défaut), **désactivé sous
`NODE_ENV=test`** (comme le rate-limit) : le comportement du balayage est
testé directement via la fonction `runReminderSweep()`, indépendamment de
ce minuteur. Pas de file d'attente, pas de Redis, pas de cron externe.

Fenêtre robuste de [23h, 25h] avant `startAt`, sur les rendez-vous
`CONFIRMED` uniquement (jamais `CANCELLED`) : suffisamment large pour
rester fiable face à la cadence de 15 minutes et à de courtes
indisponibilités de l'API, sans jamais produire de doublon (contrainte
unique ci-dessus).

## Endpoints prévus (étapes suivantes)

Rien de planifié à ce jour au-delà de ce qui est déjà implémenté (étapes 6
à 14) — voir `docs/architecture/README.md` pour le reste de la roadmap
(tests approfondis, durcissement sécurité).
