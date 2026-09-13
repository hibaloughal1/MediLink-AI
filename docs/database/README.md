# Base de données — MediLink AI

## Statut actuel

`User`, `RefreshToken` (Auth/Users), `Doctor`, `Specialty`, `City`,
`DoctorSpecialty` (Doctors/Specialties/Cities), `Availability`,
`Appointment` (Availability/Appointments) — schéma inchangé depuis
l'étape 9. Les étapes 10 à 13 (Appointments, dashboards
patient/médecin/admin) n'ont ajouté que du code applicatif par-dessus ce
même schéma. L'étape 14 (Notifications) ajoute le modèle `Notification`
(voir ci-dessous) — la seule migration depuis l'étape 9. `AuditLog` reste
à ajouter si une étape future en a besoin.

## Modèles

### `User`

Identité, authentification, rôle et statut (cf. cahier des charges §12.1).

| Champ | Type | Notes |
|---|---|---|
| `id` | UUID | clé primaire |
| `email` | string | unique |
| `passwordHash` | string | jamais exposé par l'API |
| `role` | enum `PATIENT` \| `DOCTOR` \| `ADMIN` | |
| `status` | enum `ACTIVE` \| `SUSPENDED` | défaut `ACTIVE` |
| `firstName`, `lastName` | string | |
| `phone` | string? | optionnel |
| `createdAt`, `updatedAt` | DateTime | |

Les informations spécifiques au métier ne sont pas dans `User`, pour ne
pas mélanger identité/authentification et données métier. Le profil
patient détaillé sera ajouté plus tard (`Patient`) ; le profil
professionnel du médecin existe depuis l'étape 8 (`Doctor`, ci-dessous).

### `RefreshToken`

Jeton de rafraîchissement de session, avec rotation à chaque utilisation.
N'est pas listé comme entité dans le cahier des charges : c'est un détail
d'implémentation nécessaire à une authentification JWT sécurisée (access
token courte durée + session longue durée révocable).

| Champ | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `userId` | UUID | FK vers `User`, `onDelete: Cascade` |
| `tokenHash` | string | unique — **seul le hash SHA-256 est stocké**, jamais le jeton en clair |
| `expiresAt` | DateTime | |
| `revokedAt` | DateTime? | rempli à la déconnexion ou lors d'une rotation |
| `createdAt` | DateTime | |

### `City`

Ville où exerce un médecin (table de référence, pas un champ texte libre).

| Champ | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `name` | string | unique |

### `Specialty`

Spécialité médicale (table de référence).

| Champ | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `name` | string | unique |

### `Doctor`

Profil professionnel du médecin, relié 1-1 à `User`. **Un compte
`role=DOCTOR` n'est pas automatiquement un médecin vérifié/réservable** :
c'est `verificationStatus` qui en décide, contrôlé exclusivement par
l'ADMIN (cf. cahier des charges §9, règle 4).

| Champ | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `userId` | UUID | FK vers `User`, unique (1-1), `onDelete: Cascade` |
| `licenseNumber` | string? | identifiant professionnel, optionnel |
| `bio` | string? | |
| `professionalPhone` | string? | |
| `cityId` | UUID? | FK vers `City` |
| `address` | string? | adresse du cabinet |
| `verificationStatus` | enum `PENDING` \| `VERIFIED` \| `REJECTED` \| `SUSPENDED` | défaut `PENDING` |
| `verifiedAt` | DateTime? | rempli uniquement quand `VERIFIED` |
| `createdAt`, `updatedAt` | DateTime | |

### `DoctorSpecialty`

Relation many-to-many `Doctor` ↔ `Specialty` (clé composite
`[doctorId, specialtyId]`), `onDelete: Cascade` des deux côtés — un
médecin peut avoir plusieurs spécialités.

### `Availability`

Règle de disponibilité d'un médecin. Une seule table, discriminée par
`type` :

| Champ | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `doctorId` | UUID | FK vers `Doctor`, `onDelete: Cascade` |
| `type` | enum `RECURRING` \| `DATE_OVERRIDE` | |
| `dayOfWeek` | Int? | 0 (dimanche) .. 6 (samedi) — RECURRING uniquement |
| `startTime`, `endTime` | string? | `"HH:mm"`, heure locale Africa/Casablanca — RECURRING uniquement |
| `slotDurationMinutes` | Int? | 5 à 240 — RECURRING uniquement |
| `effectiveFrom` | Date? | obligatoire (validé par Zod) si RECURRING |
| `effectiveTo` | Date? | nullable = sans fin — RECURRING uniquement |
| `specificDate` | Date? | DATE_OVERRIDE uniquement, bloque toute la journée |
| `isActive` | Boolean | défaut `true`, permet de désactiver sans supprimer |

Contrainte `@@unique([doctorId, specificDate])` : Postgres autorisant
plusieurs `NULL`, elle n'affecte que les lignes `DATE_OVERRIDE` (une seule
règle de blocage par date et par médecin). Voir `docs/architecture/README.md`
(section Timezone) pour la stratégie `effectiveFrom`/`effectiveTo` et
l'algorithme de génération des créneaux.

### `Appointment`

Introduit à l'étape 9 (calcul de créneaux, anti-double-réservation), servi
par l'API depuis l'étape 10 (`/api/appointments`, `/api/doctors/me/appointments`,
`/api/admin/appointments`). Schéma inchangé entre les deux étapes.

| Champ | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `doctorId` | UUID | FK vers `Doctor`, `onDelete: Cascade` |
| `patientId` | UUID | FK vers `User`, `onDelete: Cascade` |
| `startAt`, `endAt` | DateTime | instants UTC |
| `status` | enum `PENDING` \| `CONFIRMED` \| `CANCELLED` \| `COMPLETED` \| `NO_SHOW` | défaut `PENDING` dans le schéma ; le futur flux de réservation MVP créera toujours directement en `CONFIRMED` (voir `docs/security/README.md`) |

Volontairement **découplé d'`Availability`** (aucune FK vers une règle de
disponibilité) : modifier, désactiver ou supprimer une `Availability` ne
peut donc jamais altérer un `Appointment` existant.

**Contrainte anti-double-réservation** (index unique partiel, ajouté en
SQL brut car non exprimable dans le DSL Prisma actuel) :

```sql
CREATE UNIQUE INDEX "appointments_doctor_slot_unique"
ON "Appointment" ("doctorId", "startAt")
WHERE status IN ('PENDING', 'CONFIRMED');
```

### `Notification`

Introduit à l'étape 14. Une ligne = une notification pour UN destinataire,
sur UN canal, à propos d'UN rendez-vous. `IN_APP` alimente la cloche de
l'interface ; `EMAIL` porte l'état d'un envoi best-effort (jamais garanti).

| Champ | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `userId` | UUID | FK vers `User`, `onDelete: Cascade` — le destinataire |
| `appointmentId` | UUID | FK vers `Appointment`, `onDelete: Cascade` — **obligatoire** : à cette étape, toute notification concerne un rendez-vous |
| `type` | enum `APPOINTMENT_BOOKED` \| `APPOINTMENT_CANCELLED` \| `APPOINTMENT_REMINDER` | |
| `channel` | enum `IN_APP` \| `EMAIL` | |
| `status` | enum `PENDING` \| `SENT` \| `FAILED` | défaut `PENDING` ; `IN_APP` passe directement à `SENT` (ne peut pas échouer) |
| `errorMessage` | string? | rempli uniquement si `status = FAILED` (canal `EMAIL`) — jamais exposé par l'API |
| `readAt` | DateTime? | canal `IN_APP` uniquement |
| `sentAt` | DateTime? | |
| `createdAt` | DateTime | |

**Contrainte d'idempotence** — le mécanisme réel, garanti par PostgreSQL
(pas seulement par la logique applicative) :

```sql
CREATE UNIQUE INDEX "Notification_userId_appointmentId_type_channel_key"
ON "Notification" ("userId", "appointmentId", "type", "channel");
```

Au plus une notification par (destinataire, rendez-vous, type, canal),
y compris sous appels concurrents, relances, ou redémarrage de l'API — voir
`docs/api/README.md` pour le détail du mécanisme (capture de l'erreur
Prisma `P2002`) et le scheduler de rappel qui s'appuie dessus.

## Migrations

- `20260911221328_init_infrastructure` (étape 6) : mise en place initiale (modèle technique `HealthCheck`, supprimé depuis).
- `20260912000819_auth_users_init` (étape 7) : suppression de `HealthCheck`, ajout de `User`, `RefreshToken`, des enums `Role` et `UserStatus`.
- `20260912013352_doctors_specialties_cities` (étape 8) : ajout de `City`, `Specialty`, `Doctor`, `DoctorSpecialty` et de l'enum `DoctorVerificationStatus`.
- `20260912102417_availability_and_appointment` (étape 9) : ajout de `Availability`, `Appointment`, des enums `AvailabilityType`/`AppointmentStatus`, et de l'index unique partiel anti-double-réservation.
- Étape 10 : **aucune migration** — uniquement du code applicatif (`/api/appointments`, `/api/doctors/me/appointments`, `/api/admin/appointments`) par-dessus le schéma existant.
- Étape 11 (dashboard patient) et étape 12 (dashboard médecin) : **aucune migration** — consommation frontend pure des endpoints existants.
- Étape 13 (dashboard admin) : **aucune migration** — `User.status` (`UserStatus`, étape 7) et `RefreshToken` (étape 7) existaient déjà ; seules deux routes (`/api/admin/users/:id/suspend|reactivate`) et deux filtres de requête optionnels ont été ajoutés par-dessus le schéma existant.
- `20260912144938_add_notifications` (étape 14) : ajout de `Notification` et des enums `NotificationType`/`NotificationChannel`/`NotificationStatus`, plus les relations `User.notifications`/`Appointment.notifications`. Migration strictement additive : aucune colonne existante modifiée ou supprimée.

## Entités à venir

`AuditLog`, etc. — voir le cahier des charges §12 et
`docs/architecture/README.md`.

## Backup / Recovery (étape 16)

Aucun mécanisme de sauvegarde n'est implémenté dans ce dépôt — c'est une
responsabilité d'infrastructure, volontairement gardée hors du code
applicatif pour rester simple (pas de système de backup maison à
maintenir). Procédure minimale documentée pour un déploiement pilote :

### Sauvegarde

```bash
# Depuis l'hôte, en visant le conteneur (ou l'instance managée) :
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U medilink medilink > medilink_$(date +%Y%m%d_%H%M%S).sql
```

- **Fréquence recommandée pour un pilote** : une sauvegarde quotidienne
  suffit (le volume de données d'un MVP en phase pilote est faible, et une
  perte d'une journée au pire est un risque acceptable à ce stade — à
  révision à mesure que de vraies données patients s'accumulent).
- Si un PostgreSQL managé est utilisé à la place du conteneur (recommandé,
  voir `docs/deployment/README.md`), préférer les sauvegardes automatiques
  natives de l'hébergeur plutôt que ce `pg_dump` manuel.
- Stocker les sauvegardes **hors** de la machine hébergeant l'application
  (un disque qui crashe ne doit jamais emporter à la fois l'application et
  ses sauvegardes).

### Restauration

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U medilink medilink < medilink_20260101_030000.sql
```

### Test de restauration

**Une sauvegarde jamais restaurée n'est pas une sauvegarde vérifiée.**
Avant le premier déploiement pilote réel, restaurer au moins une fois une
sauvegarde sur une base PostgreSQL séparée (ex. `TEST_DATABASE_URL` ou un
conteneur jetable) et confirmer que l'application démarre et fonctionne
normalement dessus. Répéter cette vérification périodiquement (ex. à
chaque changement de schéma significatif), pas seulement une fois pour
toutes.

### Migrations et sauvegardes

Toujours prendre une sauvegarde fraîche **immédiatement avant** d'exécuter
`prisma migrate deploy` en production (voir `docs/deployment/README.md`) :
en cas de problème pendant/après une migration, la restauration de cette
sauvegarde reste le seul mécanisme de retour en arrière fiable (Prisma ne
fournit pas de rollback automatique de migration en production).
