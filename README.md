# MediLink AI — MVP

Plateforme intelligente d'accès et de gestion des soins adaptée au Maroc.

> **Statut actuel : Étape 16 — MVP techniquement finalisé.**
> Auth/Users (étape 7), Doctors/Specialties/Cities (étape 8), Availability
> (étape 9), Appointments (étape 10), le dashboard patient (étape 11), le
> dashboard médecin (étape 12), le dashboard admin (étape 13), les
> notifications de rendez-vous (étape 14 : in-app + email, réservation,
> annulation, rappel à ~24h), une suite de tests approfondie + un seed de
> démonstration (étape 15) et un durcissement sécurité + une pile Docker de
> production + une documentation de déploiement (étape 16) sont implémentés
> et testés. Voir `docs/architecture/README.md` pour le plan complet par
> étapes, `docs/testing/README.md` pour la stratégie de tests et
> `docs/deployment/README.md` pour le déploiement de production.

## Structure du monorepo

```
apps/web    -> Next.js (App Router) + TypeScript + Tailwind CSS
apps/api    -> Node.js + TypeScript + Fastify + Prisma
apps/ai     -> squelette Python (FastAPI), non implémenté (phase 3)
packages/*  -> scaffolding pour du code partagé (types, config ESLint/TS,
               composants UI) — volontairement conservés vides depuis
               l'étape 6 : apps/web et apps/api n'ont jamais eu besoin d'y
               dupliquer de logique pour justifier de les remplir. À
               utiliser si un vrai besoin de partage de code apparaît,
               jamais à supprimer par principe (voir docs/architecture/README.md).
```

## Prérequis

- Node.js >= 22
- npm >= 10
- Docker Desktop (Docker Engine + Compose v2)

## Configuration

Copier les fichiers d'exemple et renseigner de vraies valeurs locales :

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Ne jamais committer un fichier `.env` réel (voir `.gitignore`).

`apps/api/.env` doit exister **avant** de lancer l'API, en local comme via
Docker Compose : le conteneur `api` monte `apps/api/` en volume, donc son
`.env` local (secrets JWT, cookie) est repris tel quel à l'intérieur du
conteneur. `DATABASE_URL` défini dans `docker-compose.yml` reste
prioritaire à l'intérieur du conteneur (pointe vers `postgres`, pas
`localhost`).

## Installation des dépendances

```bash
npm install
```

## Lancer PostgreSQL (via Docker)

```bash
docker compose up -d postgres
```

## Prisma (génération du client / migrations)

```bash
npm run prisma:generate
npm run prisma:migrate
```

Le schéma Prisma contient `User`, `RefreshToken` (Auth/Users), `Doctor`,
`Specialty`, `City`, `DoctorSpecialty` (étape 8) et `Availability`,
`Appointment` (étape 9, servi par l'API depuis l'étape 10 — schéma
inchangé entre les deux).

### Base de test dédiée

Les tests (`npm run test:api`) tournent contre `TEST_DATABASE_URL`, une
base **distincte** de la base de développement/seed, pour ne jamais la
polluer avec des données de test. La première fois, créer cette base et y
appliquer les migrations :

```bash
docker exec <container_postgres> psql -U medilink -d medilink -c "CREATE DATABASE medilink_test OWNER medilink;"
npm run prisma:migrate:test --workspace=apps/api
```

`npm test` (dans `apps/api`) le fait automatiquement via le hook `pretest`.

### Seed de démonstration

```bash
npm run prisma:seed
```

Crée 1 ADMIN, 5 DOCTORS (statuts PENDING/VERIFIED/REJECTED/SUSPENDED
variés, les deux VERIFIED ont des disponibilités récurrentes de
démonstration) et 10 PATIENTS, avec les 6 villes et 10 spécialités du MVP.
Mot de passe commun (démo uniquement) : `Password123!`. Script idempotent
(rejouable sans dupliquer les données).

## Lancer l'API en développement

```bash
npm run dev:api
```

Vérification :
- `GET http://localhost:4000/health` -> `{ "status": "ok", "service": "medilink-api" }`
- `GET http://localhost:4000/health/db` -> `{ "status": "ok", "database": "connected" }`
- `POST http://localhost:4000/api/auth/register` -> crée un compte (PATIENT ou DOCTOR)
- `POST http://localhost:4000/api/auth/login` -> connexion (access token + cookie de refresh)
- `GET http://localhost:4000/api/users/me` (avec `Authorization: Bearer <token>`) -> profil courant
- `GET http://localhost:4000/api/doctors?city=Agadir&specialty=Cardiologie` -> recherche publique (médecins VERIFIED uniquement)
- `GET http://localhost:4000/api/specialties`, `GET http://localhost:4000/api/cities` -> annuaires
- `GET http://localhost:4000/api/doctors/<id>/availability?from=2026-10-01&to=2026-10-07` -> créneaux calculés d'un médecin VERIFIED (utiliser l'id d'un médecin du seed, ex. dr.bennani ou dr.elfassi)
- `POST http://localhost:4000/api/appointments` (PATIENT, `{ doctorId, startAt, endAt }` repris tels quels d'un créneau ci-dessus) -> réservation CONFIRMED
- `GET http://localhost:4000/api/appointments/me` (PATIENT) / `GET http://localhost:4000/api/doctors/me/appointments` (DOCTOR) -> historique / agenda

Voir `docs/api/README.md` pour la liste complète des endpoints.

## Lancer le frontend en développement

```bash
npm run dev:web
```

Ouvrir `http://localhost:3000`.

Espace patient (étape 11) : `/doctors` (recherche), `/doctors/:id` (fiche +
réservation), `/patient/appointments`, `/patient/profile`.

Espace médecin (étape 12), réservé au rôle `DOCTOR` (`useRequireDoctor` —
garde UX uniquement, la sécurité réelle reste sur les routes `/api/doctors/me*`
côté API) :
- `/doctor` — tableau de bord (statut de vérification + navigation).
- `/doctor/profile` — création (si profil absent) ou édition du profil professionnel.
- `/doctor/availability` — gestion des règles `RECURRING` et `DATE_OVERRIDE`.
- `/doctor/appointments` — agenda et annulation des rendez-vous.

Le rôle `DOCTOR` n'a aujourd'hui aucun formulaire d'inscription dédié dans
`/register` (qui ne crée que des comptes `PATIENT`) : un compte médecin de
test se crée via `POST /api/auth/register` avec `role: "DOCTOR"`, ou en
utilisant un des comptes du seed de démonstration.

Espace admin (étape 13), réservé au rôle `ADMIN` (`useRequireAdmin` — garde
UX uniquement, la sécurité réelle reste sur les routes `/api/admin/*` et
`/api/users` côté API) :
- `/admin` — tableau de bord (compteurs : médecins en attente, comptes utilisateurs, rendez-vous).
- `/admin/doctors` — vérification des médecins (verify/reject/suspend, filtre par statut). Ne modifie que `verificationStatus` — aucune édition de profil (bio, adresse, spécialités, etc.).
- `/admin/users` — comptes utilisateurs (filtre rôle/statut, suspension/réactivation). Ne modifie jamais le rôle ; auto-suspension et suspension d'un autre ADMIN sont bloquées côté API.
- `/admin/appointments` — supervision de tous les rendez-vous, strictement en lecture seule (aucune action d'annulation/modification).

Comme pour `/register`, aucun formulaire n'existe pour créer un compte
`ADMIN` (interdit par l'inscription publique, cf. `docs/security/README.md`) :
utiliser le compte du seed (`admin@medilink.local`).

Notifications (étape 14), `/notifications`, accessible à tout utilisateur
authentifié (PATIENT/DOCTOR/ADMIN) — voir `docs/api/README.md` pour le
détail des événements (réservation, annulation, rappel) et des canaux
(in-app + email).

## Tout lancer via Docker Compose

```bash
docker compose up --build
```

Démarre PostgreSQL, l'API (port 4000) et le frontend (port 3000). Sans
configuration SMTP, les emails de notification (étape 14) ne sont pas
réellement envoyés (transport "no-op" — voir plus bas) ; les notifications
in-app, elles, fonctionnent normalement.

### Tester réellement l'envoi d'emails (Mailpit, optionnel, dev uniquement)

```bash
docker compose --profile mail up --build
```

Démarre en plus un serveur SMTP de capture locale (Mailpit — jamais utilisé
en production, jamais démarré par un simple `docker compose up`). Pour que
l'API lui envoie réellement les emails, définir dans `apps/api/.env` :

```
SMTP_HOST=mailpit
SMTP_PORT=1025
```

Les emails envoyés sont consultables sur `http://localhost:8025` (interface
web) ou via son API REST (`http://localhost:8025/api/v1/messages`).

## Tests

```bash
npm run test:api
```

## Remarques sur l'environnement de développement

- **Port PostgreSQL** : le conteneur expose PostgreSQL sur le port hôte
  **5540** (et non 5432), car un service PostgreSQL natif ainsi que
  d'autres projets Docker sur cette machine occupent déjà les ports
  5432-5434. Si vous changez de machine et que 5540 est libre mais que
  vous préférez 5432, ajustez `POSTGRES_PORT` dans `.env`.
- **Builds Docker lents** : ce projet est situé dans un dossier synchronisé
  OneDrive, ce qui ralentit fortement les opérations de fichiers utilisées
  par Docker Desktop lors du build des images (un premier build de l'image
  `api` a pris plusieurs minutes même avec le cache Docker). Un
  `.dockerignore` a été ajouté pour limiter le contexte envoyé au démon
  Docker. Pour un confort de développement optimal, il est recommandé de
  déplacer le projet hors d'un dossier synchronisé (OneDrive/Google
  Drive/Dropbox) ou d'exclure ce dossier de la synchronisation. Le
  développement local via `npm run dev:api` / `npm run dev:web` (sans
  Docker) n'est pas affecté et reste rapide.
- **Rechargement à chaud (`apps/web`) parfois silencieux sous Docker** : le
  service `web` monte `./apps/web` en volume, mais les évènements de
  système de fichiers de l'hôte ne se propagent pas toujours de façon
  fiable au conteneur (observé sous Docker Desktop/Windows, projet situé
  dans un dossier synchronisé OneDrive) — Next.js peut alors continuer à
  servir une version compilée obsolète après une modification faite sur
  l'hôte, sans aucune erreur visible. `WATCHPACK_POLLING: "true"` est donc
  défini pour le service `web` dans `docker-compose.yml`. En cas de doute
  après une modification (page qui ne semble pas changer), un
  `docker compose restart web` force une relecture complète des fichiers.
- **Builds Docker parfois très lents puis rapides** : certains builds
  observés pendant le développement ont montré des étapes bloquées des
  dizaines de minutes (téléchargement d'image, `npm install`) suivies
  d'erreurs réseau (`ECONNRESET`), alors qu'un nouveau build juste après
  se terminait en moins de 2 minutes. Cause probable : mise en veille ou
  ralentissement de la machine/VM Docker pendant les longues périodes sans
  interaction. Si un `docker compose build` semble bloqué anormalement
  longtemps, relancer la commande plutôt que d'attendre indéfiniment.

## Déploiement

Voir `docs/deployment/README.md` pour la pile Docker de production
(`docker-compose.prod.yml`), les variables d'environnement requises, les
migrations, le seed, PostgreSQL managé recommandé, les healthchecks et la
procédure de sauvegarde/restauration (`docs/database/README.md`).

## MVP — limitations connues et au-delà

Le MVP est techniquement finalisé (étape 16). Limitations connues et pistes
au-delà de ce périmètre : voir `docs/deployment/README.md` (sections
« Limitations connues » et « Roadmap V2 ») et `docs/testing/README.md`.
