# Architecture — MediLink AI (MVP)

## Principe

Architecture **modulaire** (pas de microservices) : un monorepo npm
workspaces avec 3 applications et des packages partagés.

```
Patient / Médecin / Admin
        |
        v
   apps/web (Next.js)
        |
     REST API
        |
        v
   apps/api (Fastify)
        |
   +----+----+
   |         |
   v         v
PostgreSQL  apps/ai (réservé, phase 3)
(Prisma)
```

## Applications

- **apps/web** : Next.js (App Router), TypeScript, Tailwind CSS. Trois
  espaces cloisonnés : `/patient` (étape 11), `/doctor` (étape 12), `/admin`
  (étape 13), plus `/notifications` (étape 14, commun aux trois rôles).
  i18n FR/AR prévue dès la structure (FR complet en
  premier, AR ajouté progressivement). Données chargées exclusivement côté
  client (`apiFetch`) — pas de rendu serveur pour les pages authentifiées,
  afin d'éviter la complexité d'un cookie httpOnly cross-origin en SSR.
  Chaque espace a sa propre garde de route (`useRequirePatient`,
  `useRequireDoctor`, `useRequireAdmin`) : purement une aide UX
  (redirection si le rôle ne correspond pas), jamais une frontière de
  sécurité — celle-ci reste entièrement portée par l'API (RBAC +
  vérifications de propriété sur chaque route `/me`).
- **apps/api** : Node.js + TypeScript + Fastify. Organisation en modules
  verticaux (un dossier par domaine métier sous `src/modules/`) :
  `auth`, `users`, `doctors`, `specialties`, `cities`, `availability`,
  `appointments`, `notifications` (étape 14). Il n'existe pas de module
  `admin` séparé : les routes d'administration vivent comme fichiers
  dédiés à l'intérieur du module concerné (`doctors.admin.routes.ts`,
  `appointments.admin.routes.ts`, `users.admin.routes.ts`), montés sous le
  préfixe `/api/admin/...`. Pas de module `audit` à ce jour (voir "Mesures
  prévues" dans `docs/security/README.md`).
- **apps/ai** : squelette FastAPI non implémenté. Point d'extension pour
  la phase 3 (assistant patient, RAG médical) — n'est pas câblé à l'API
  principale pour l'instant.

## Packages partagés

- **packages/types** : DTOs et enums partagés entre web et api.
- **packages/ui** : composants UI réutilisables.
- **packages/config** : configuration ESLint/TS/Tailwind commune.

Statut (réévalué à l'étape 16) : ces trois packages sont restés vides
(`export {}`) depuis leur création à l'étape 6 — `apps/web` et `apps/api`
ont chacun leur propre `tsconfig`/ESLint et n'ont jamais eu besoin de
dupliquer un DTO ou un composant au point de justifier de les remplir.
Décision : les **conserver** en l'état plutôt que les supprimer (ce ne
sont ni du code mort exécuté ni un risque de sécurité, seulement du
scaffolding en attente d'un besoin réel), pour ne pas avoir à recréer la
structure de workspace si un partage de code devient nécessaire plus tard.

## Base de données

PostgreSQL, accédé via Prisma ORM. Le schéma métier (User, Doctor,
Appointment, ...) sera ajouté à l'étape "Auth + Users" puis complété au
fil des modules. Voir `docs/database/README.md`.

Règle critique anti-double-réservation : un index unique **partiel**
PostgreSQL sur `appointments (doctor_id, start_at)` filtré sur les statuts
actifs (`PENDING`, `CONFIRMED`), ajouté en SQL brut dans une migration
Prisma. Cette contrainte est la garantie ultime (au niveau base de
données) qu'un même créneau ne peut jamais être confirmé deux fois, même
en cas de requêtes concurrentes.

## Authentification / autorisation

JWT access token (courte durée, 15 min) + refresh token opaque avec
rotation (stocké haché en base), mots de passe hachés (bcryptjs), RBAC par
rôle (`PATIENT`, `DOCTOR`, `ADMIN`). Implémenté à l'étape 7 — voir
`docs/security/README.md`.

## Timezone

**Fuseau de référence unique : `Africa/Casablanca`**, pour toute la
logique de disponibilité et de rendez-vous.

- Tous les instants concrets (`Appointment.startAt/endAt`, `verifiedAt`,
  etc.) restent stockés en `timestamptz` Postgres (UTC en interne),
  inchangé depuis l'étape 6.
- Les règles `Availability` (type `RECURRING`) stockent une heure
  d'horloge murale (`"HH:mm"`, ex. `"09:00"`) et non un instant : cette
  heure signifie toujours "heure locale Maroc", quel que soit le décalage
  UTC en vigueur ce jour-là.
- **Piège spécifique au Maroc** : `Africa/Casablanca` applique en
  permanence UTC+1 (WEST) **sauf pendant le Ramadan**, où le pays repasse
  temporairement à UTC+0 — décision gouvernementale encodée dans la base
  IANA tzdata. Un décalage codé en dur (`+01:00`) serait donc **faux**
  une partie de l'année.
- Conversion via la bibliothèque **`date-fns-tz`** (fonctions
  `fromZonedTime`/`formatInTimeZone`), qui résout le bon décalage pour
  chaque date via tzdata — jamais d'arithmétique d'offset manuelle. Voir
  `apps/api/src/lib/timezone.ts`.
- **Piège vérifié pendant le développement** : la machine de
  développement locale a elle-même `Africa/Casablanca` comme fuseau
  système, ce qui aurait masqué silencieusement un bug d'utilisation
  d'accesseurs `Date` dépendant du fuseau du process plutôt que du fuseau
  cible explicite. `utcToCalendarDate()` utilise donc `formatInTimeZone`
  (jamais les accesseurs bruts d'un objet `Date`, dont le résultat dépend
  du fuseau système d'exécution) — le comportement reste donc correct même
  sur un serveur configuré en UTC (recommandé pour la prod/Docker).
- Le frontend affiche toujours les instants UTC renvoyés par l'API dans le
  fuseau du navigateur (`Intl.DateTimeFormat`) ; il ne renvoie jamais
  d'heure locale reconstituée à l'API pour une réservation.

## Notifications (étape 14)

Architecture volontairement minimale, cohérente avec le monolithe existant
— pas de file d'attente, pas de service séparé :

- **Déclenchement événementiel** : `apps/api/src/modules/notifications/notifications.service.ts`
  est appelé directement depuis les routes `appointments` (réservation,
  annulation) une fois la mutation déjà réussie — jamais l'inverse. Une
  erreur de notification ne peut donc jamais faire échouer une réservation
  ou une annulation déjà actée en base.
- **Transport email pluggable** : `apps/api/src/plugins/email-transport.ts`
  décore l'instance Fastify (`app.emailTransport`, même mécanisme que
  `app.prisma`) avec soit un vrai transport SMTP (`nodemailer`, si
  `SMTP_HOST` est défini), soit un transport "no-op" par défaut — aucun
  branchement conditionnel ailleurs dans le code. Timeout de connexion/envoi
  de 5 secondes pour ne jamais bloquer une requête HTTP sur un SMTP lent.
- **Idempotence portée par PostgreSQL** : la contrainte unique
  `(userId, appointmentId, type, channel)` sur `Notification` (voir
  `docs/database/README.md`) est LE mécanisme d'idempotence — pas une
  vérification applicative préalable, qui serait sujette à des conditions
  de course. Une tentative de doublon échoue avec `P2002`, capturée et
  traitée comme "déjà fait".
- **Scheduler de rappel in-process** : un simple `setInterval` dans
  `apps/api/src/app.ts`, désactivé sous `NODE_ENV=test`. Aucun état en
  mémoire — un redémarrage de l'API ne peut donc jamais provoquer de
  rappel en double, la déduplication vivant entièrement dans la contrainte
  ci-dessus.
- **Mailpit (dev uniquement)** : `docker-compose.yml` déclare un service
  `mailpit` sous le profil Docker Compose `mail` (`docker compose
  --profile mail up`) — jamais démarré par défaut, jamais une dépendance de
  production. Permet de vérifier réellement l'envoi d'un email en local ou
  en test Playwright, via son interface web/API REST sur le port 8025.

## Plan de développement par étapes

| Étape | Contenu | Statut |
|---|---|---|
| 6 | Init monorepo, Docker, PostgreSQL, Prisma (infra), Fastify (health-check), Next.js (page d'accueil) | ✅ fait |
| 7 | Auth + Users (register/login/refresh/logout, RBAC, hashing) + tests | ✅ fait |
| 8 | Doctors + Specialties + Cities (profil pro, vérification ADMIN, recherche publique) + tests | ✅ fait |
| 9 | Availability (création/édition/suppression, calcul de créneaux, modèle Appointment minimal) + tests | ✅ fait |
| 10 | Appointments (routes de réservation, annulation) + test de concurrence critique | ✅ fait |
| 11 | Dashboard patient (recherche, réservation, mes rendez-vous, mon profil) | ✅ fait |
| 12 | Dashboard médecin (profil, disponibilités, agenda) | ✅ fait |
| 13 | Dashboard admin (vérification médecins, suspension de comptes, supervision rendez-vous) | ✅ fait |
| 14 | Notifications (in-app + email : réservation, annulation, rappel) | ✅ fait |
| 15 | Tests approfondis + seed de démonstration | ✅ fait |
| 16 | Durcissement sécurité, Docker de production, documentation finale | ✅ fait |

## Ce qui n'est volontairement PAS dans ce MVP

Dossier médical, ordonnance électronique, diagnostic IA, téléconsultation,
paiement en ligne, pharmacie, laboratoire, assurance, application mobile
native, WhatsApp, RAG médical, transcription médicale, assistant IA
médecin. Ces fonctions appartiennent aux phases 2, 3 et 4 de la roadmap
du cahier des charges.
