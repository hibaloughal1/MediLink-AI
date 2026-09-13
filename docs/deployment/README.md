# Déploiement — MediLink AI

Ce document couvre le déploiement de production du MVP (étape 16). Il
suppose que vous connaissez déjà le fonctionnement en développement
(README racine + `docs/architecture/README.md`) — il ne le répète pas.

## Trois environnements distincts

| | DEV | DÉMO / PILOTE | PRODUCTION |
|---|---|---|---|
| Fichiers Docker | `docker-compose.yml` + `*.Dockerfile` | `docker-compose.yml` (avec `--profile mail`) | `docker-compose.prod.yml` + `*.Dockerfile.prod` |
| Serveur API | `tsx watch` (rechargement à chaud) | idem DEV | `node dist/server.js` (build compilé) |
| Serveur Web | `next dev` | idem DEV | `next start` (build compilé) |
| `NODE_ENV` | `development` | `development` | `production` |
| PostgreSQL | conteneur, port publié (5540) | conteneur, port publié (5540) | conteneur **sans port publié**, ou service managé (recommandé) |
| Mailpit | disponible via `--profile mail` | disponible via `--profile mail` | **jamais présent** |
| Cookie de refresh `secure` | `false` (HTTP local) | `false` | `true` (nécessite HTTPS) |
| CORS | `origin: true` (reflète tout) | `origin: true` | `CORS_ORIGIN` obligatoire, liste blanche |
| Volumes de code source | oui (bind mount, live-reload) | oui | **aucun** — image immuable |

La démo/pilote utilise exactement les fichiers de développement : c'est un
choix délibéré (voir `docker-compose.yml`), pas une confusion — un pilote à
petite échelle n'a pas besoin d'une image de production pour être présenté.
Le fichier `docker-compose.prod.yml` est destiné à un déploiement réel
(même limité), où les propriétés de sécurité de la section précédente
(cookie `secure`, CORS restreint, pas de code source monté) comptent
réellement.

**Si vous testez cette pile sur la même machine que la pile de
développement** (ex. avant un déploiement réel, pour un smoke test local) :
le nom de projet Compose (`name: medilinkai-prod`) et les noms de
conteneurs (`medilinkai-postgres-prod`, `medilinkai-api-prod`,
`medilinkai-web-prod`) sont volontairement distincts de ceux de
`docker-compose.yml`, pour ne jamais recréer/écraser un conteneur de
développement en cours d'exécution. Les **ports hôte** sont également
fixés à des valeurs distinctes : **4001** pour l'API (au lieu de 4000 en
dev) et **3001** pour le web (au lieu de 3000), pour que les deux piles
restent démarrables **simultanément** sans conflit de port. Le port à
l'intérieur du conteneur (4000/3000) ne change pas — c'est cohérent avec
`NEXT_PUBLIC_API_URL`, qui doit alors pointer vers `http://localhost:4001`
pour un test local de ce type, puisque c'est le port hôte que le
navigateur contacte réellement. Ces deux ports (4001/3001) sont
spécifiques à un test local côte à côte avec la pile de dev : pour un
vrai déploiement (une seule pile sur la machine cible), rien n'empêche de
les remapper à 4000/3000 ou d'y placer un reverse proxy.

## Prérequis

- Docker Engine + Compose v2 sur la machine/VM cible.
- Un nom de domaine pointant vers cette machine (nécessaire pour `secure`
  sur le cookie de refresh, qui exige HTTPS).
- Un reverse proxy gérant TLS devant `web`/`api` (nginx, Caddy, Traefik, ou
  l'équivalent fourni par votre hébergeur) — **non fourni par ce repository**,
  volontairement, pour rester simple : ajouter un reverse proxy TLS
  générique ne nécessite aucune modification du code applicatif, seulement
  un routage `https://votredomaine.example` → `web:3000` et
  `https://votredomaine.example/api` (ou un sous-domaine dédié) → `api:4000`.

## Variables d'environnement (production)

Toutes définies via l'environnement du shell ou un fichier `.env` **à côté
de `docker-compose.prod.yml`** (mécanisme natif de `docker compose`, jamais
copié dans une image — voir `.dockerignore`). Les variables marquées
« obligatoire » font échouer le démarrage avec un message clair si elles
sont absentes (`${VAR:?message}` dans `docker-compose.prod.yml`).

| Variable | Obligatoire | Exemple / note |
|---|---|---|
| `POSTGRES_USER` | non (défaut `medilink`) | |
| `POSTGRES_PASSWORD` | **oui** | mot de passe fort, dédié à la production |
| `POSTGRES_DB` | non (défaut `medilink`) | |
| `DATABASE_URL` | dérivée automatiquement dans `docker-compose.prod.yml` à partir des trois variables ci-dessus | pointer manuellement vers un PostgreSQL managé si vous n'utilisez pas le conteneur (voir plus bas) — avec Supabase, la connexion "pooled" (PgBouncer) |
| `DIRECT_URL` | dérivée automatiquement dans `docker-compose.prod.yml`, identique à `DATABASE_URL` (pas de pooler local) | avec un PostgreSQL managé (Supabase), la connexion **directe** (non poolée) — requise par `prisma migrate deploy`, jamais utilisée à l'exécution par l'API |
| `TEST_DATABASE_URL` | non utilisée en production | uniquement pour `apps/api/tests` en développement/CI |
| `JWT_ACCESS_SECRET` | **oui** | `openssl rand -hex 32`, jamais réutilisé entre environnements |
| `JWT_ACCESS_EXPIRES_IN` | non (défaut `15m`) | |
| `REFRESH_TOKEN_TTL_DAYS` | non (défaut `30`) | |
| `COOKIE_SECRET` | **oui** | `openssl rand -hex 32`, distinct de `JWT_ACCESS_SECRET` |
| `CORS_ORIGIN` | **oui** | domaine(s) réel(s) du frontend, séparés par des virgules — jamais `*`/`origin: true` en production |
| `NEXT_PUBLIC_API_URL` | **oui** | URL publique de l'API telle que le navigateur du patient/médecin y accédera (ex. `https://api.votredomaine.example`) — intégrée au build, voir plus bas |
| `SMTP_HOST` | non | absent = transport no-op, aucun email réel envoyé (sûr par défaut) |
| `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | non | requis seulement si `SMTP_HOST` est défini |
| `API_PORT`, `WEB_PORT` | non (défauts 4000/3000) | ports internes exposés par les conteneurs vers l'hôte (le reverse proxy s'y connecte) |

Mailpit n'a **aucune** variable de production : il n'existe pas dans
`docker-compose.prod.yml`, point final.

## Build

`NEXT_PUBLIC_API_URL` est intégré au bundle JavaScript **au moment du
build**, pas lu dynamiquement au démarrage (contrainte de Next.js) — il
doit donc être correct **avant** de lancer le build, pas seulement au
démarrage du conteneur :

```bash
export CORS_ORIGIN=https://votredomaine.example
export NEXT_PUBLIC_API_URL=https://api.votredomaine.example
export JWT_ACCESS_SECRET=$(openssl rand -hex 32)
export COOKIE_SECRET=$(openssl rand -hex 32)
export POSTGRES_PASSWORD=... # mot de passe fort

docker compose -f docker-compose.prod.yml build
```

Si `NEXT_PUBLIC_API_URL` change après coup, il faut **reconstruire**
l'image `web` (pas seulement redémarrer le conteneur).

## Migrations

```bash
docker compose -f docker-compose.prod.yml up -d postgres
docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate deploy
```

- **Toujours `prisma migrate deploy`, jamais `prisma migrate dev`** (qui
  peut générer/renommer des migrations et n'est pas conçu pour la
  production).
- Jamais exécuté automatiquement au démarrage du conteneur `api` (le `CMD`
  de `api.Dockerfile.prod` est uniquement `node dist/server.js`) — c'est
  une étape manuelle et consciente, à exécuter avant de démarrer/mettre à
  jour l'application, avec une sauvegarde fraîche prise juste avant (voir
  Backup/Recovery).
- Ne jamais modifier une migration déjà appliquée dans
  `apps/api/prisma/migrations/` : une nouvelle migration corrective, jamais
  une édition rétroactive.

## Démarrage

```bash
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps   # vérifier que les 3 services sont "healthy"
```

## Seed

**Jamais exécuté automatiquement.** Utile uniquement pour un environnement
de démonstration/pilote (jamais sur une base contenant de vraies données
patients) :

```bash
docker compose -f docker-compose.prod.yml run --rm api npm run prisma:seed
```

Rappel (voir `docs/testing/README.md`) : structurellement incapable
d'envoyer un email réel, idempotent, données entièrement fictives.

## PostgreSQL

- **DEV** : conteneur Docker (`docker-compose.yml`), port publié sur
  l'hôte (5540) pour un accès direct depuis un client SQL local — acceptable
  uniquement parce que la machine de développement n'est jamais exposée
  publiquement.
- **PRODUCTION** : le conteneur `postgres` de `docker-compose.prod.yml` ne
  publie **aucun port** (accessible uniquement depuis `api` sur le réseau
  Docker interne). Pour un vrai déploiement (même un pilote), un
  **PostgreSQL managé** (fourni par votre hébergeur cloud) reste recommandé
  à la place de ce conteneur : sauvegardes automatiques, mises à jour de
  sécurité, haute disponibilité gérées pour vous. Dans ce cas, ne démarrez
  pas le service `postgres` de `docker-compose.prod.yml` et pointez
  `DATABASE_URL` directement vers l'instance managée.

## SMTP / Email

- Sans `SMTP_HOST`, l'API démarre et fonctionne normalement, simplement
  sans envoyer d'email réel (transport no-op) — comportement sûr par
  défaut si l'envoi d'email n'est pas encore requis pour un premier pilote.
- Avec `SMTP_HOST` défini, utiliser un vrai fournisseur SMTP (jamais
  Mailpit, qui n'existe pas dans ce fichier compose).
- Timeout de connexion/envoi : 5 secondes (`SMTP_TIMEOUT_MS`,
  `apps/api/src/plugins/email-transport.ts`) — un fournisseur SMTP lent ou
  injoignable ne peut jamais bloquer une réservation/annulation.

## Healthchecks

- `api` : `GET /health/db` (vérifie la connexion PostgreSQL, pas
  seulement que le processus Node répond).
- `web` : `GET /`.
- `postgres` : `pg_isready`.

`docker compose -f docker-compose.prod.yml ps` affiche l'état de chaque
service ; `web` ne démarre son healthcheck qu'une fois `api` déclaré
`healthy` (`depends_on: condition: service_healthy`).

## Rollback minimal

En l'absence d'orchestrateur (délibérément, MVP simple) :

1. **Code applicatif** : conserver l'image Docker précédente
   (`docker compose -f docker-compose.prod.yml build` crée une nouvelle
   image sans supprimer l'ancienne tant qu'elle n'est pas explicitement
   supprimée) — `docker compose -f docker-compose.prod.yml up -d` avec le
   tag précédent restaure l'ancienne version applicative.
2. **Base de données** : un rollback de migration n'est pas automatisé
   (Prisma ne fournit pas de "migrate down" en production) — la stratégie
   de secours est une restauration depuis une sauvegarde prise juste avant
   la migration (voir Backup/Recovery), pas une tentative d'annuler le SQL
   appliqué.
3. Toujours valider un déploiement sur un environnement de test/staging
   identique avant la production, précisément pour éviter d'avoir à
   recourir à ce rollback.

## Limitations connues (à ne pas sur-promettre)

- Pas de retry automatique pour un email `FAILED` (voir
  `docs/testing/README.md`).
- Scheduler de rappel de rendez-vous in-process (`setInterval`), pas de
  file d'attente externe — suffisant pour un seul processus API, pas conçu
  pour un scaling horizontal de l'API (hors périmètre MVP).
- La cloche de notifications n'est pas temps réel (l'utilisateur doit
  recharger/naviguer pour voir une nouvelle notification) — pas de
  WebSocket/SSE dans ce MVP.
- Aucune fonctionnalité de téléconsultation, paiement, dossier médical,
  ordonnance ou diagnostic assisté par IA — hors périmètre du MVP actuel.
- Le backup PostgreSQL reste une responsabilité d'infrastructure externe
  (voir section dédiée), pas un mécanisme intégré à l'application.

## Roadmap V2 (structure, non détaillée)

Non commercial, uniquement pour situer ce qui est délibérément hors
périmètre du MVP actuel et pourrait faire l'objet d'une étape ultérieure,
à valider avant tout démarrage :

1. Observabilité (métriques, alerting) au-delà des logs structurés actuels.
2. Notifications temps réel (WebSocket/SSE) pour la cloche.
3. File d'attente dédiée pour les emails (retry automatique, backoff).
4. Scalabilité horizontale de l'API (nécessiterait de sortir le scheduler
   de rappel du processus API).
5. Nouveaux rôles (ex. structure de santé) et fonctionnalités métier
   validées séparément — explicitement non planifiées ici.
