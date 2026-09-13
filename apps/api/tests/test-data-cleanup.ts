import type { PrismaClient } from "@prisma/client";

// Fichier volontairement dépourvu de tout import "vitest" : il est chargé
// à la fois par `tests/helpers.ts` (contexte normal des tests) ET par
// `tests/global-teardown.ts` (contexte "globalSetup" de Vitest, qui
// s'exécute dans un processus séparé où l'API de test — `expect`, etc. —
// n'est pas disponible). Importer `vitest` ici ferait échouer le
// `globalSetup` avec l'erreur "Vitest failed to access its internal
// state." (constaté concrètement lors de l'implémentation).

// Domaine dédié et exclusif aux comptes créés par les tests : jamais utilisé
// par le seed de démonstration (qui reste sur `@medilink.local`, sans le
// sous-domaine "test."). Cette distinction est ce qui permet à
// `cleanupTestData` de ne jamais pouvoir toucher aux données du seed, même
// si `TEST_DATABASE_URL` venait un jour à pointer par erreur vers une base
// contenant un seed (défense en profondeur, en plus de la garde stricte de
// `vitest.config.ts` et de `tests/global-teardown.ts`).
export const TEST_EMAIL_DOMAIN = "@test.medilink.local";

// Préfixes de noms utilisés exclusivement par les tests pour les villes et
// spécialités qu'ils créent directement (voir `createCityAndSpecialty` dans
// `tests/helpers.ts` et `tests/doctors.test.ts`) — jamais utilisés par les
// noms de villes/spécialités du seed (liste fixe, cf. `prisma/seed.ts`).
export const TEST_CITY_NAME_PREFIXES = ["Ville-", "ListCity-"];
export const TEST_SPECIALTY_NAME_PREFIXES = ["Specialite-", "ListSpecialty-"];

/**
 * Nettoie exclusivement les données créées par les tests (étape 15) —
 * jamais la base de développement, jamais le seed de démonstration.
 *
 * Appelée UNE SEULE FOIS depuis `tests/global-teardown.ts` (Vitest
 * `globalSetup`), après que TOUS les fichiers de test ont terminé — jamais
 * depuis le `afterAll` d'un fichier individuel. Les fichiers de test
 * s'exécutent en parallèle par défaut sous Vitest et partagent tous la même
 * base `TEST_DATABASE_URL` : un nettoyage déclenché à la fin d'un seul
 * fichier supprimerait les données d'un autre fichier encore en cours
 * d'exécution (constaté concrètement : `createDoctorProfile` d'un fichier
 * échouait car la ville/spécialité qu'il venait de créer avait déjà été
 * supprimée par le nettoyage — déclenché à ce moment-là par `afterAll` —
 * d'un autre fichier terminé entre-temps).
 *
 * Stratégie :
 *  1. Un seul `deleteMany` sur `User`, ciblant uniquement le domaine d'email
 *     réservé aux tests (`@test.medilink.local`). Les cascades déjà
 *     définies dans `prisma/schema.prisma` (User -> RefreshToken,
 *     User -> Doctor -> DoctorSpecialty/Availability/Appointment,
 *     User -> Appointment ["PatientAppointments"],
 *     User/Appointment -> Notification) suppriment alors tout le
 *     sous-graphe associé en une seule opération SQL côté PostgreSQL —
 *     jamais un TRUNCATE global, jamais une suppression table-par-table
 *     qui pourrait oublier une relation ou violer une contrainte de clé
 *     étrangère.
 *  2. Seulement ensuite, les villes/spécialités créées directement par les
 *     tests (non liées par cascade à `User` — `Doctor.cityId`/
 *     `DoctorSpecialty.specialtyId` n'ont pas `onDelete: Cascade` vers
 *     `City`/`Specialty`), identifiées par leurs préfixes de nom dédiés.
 *     L'ordre est important : après l'étape 1, plus aucun `Doctor` de test
 *     ne référence ces lignes, donc leur suppression ne peut jamais violer
 *     de contrainte de clé étrangère.
 *
 * Ne contient elle-même aucun garde-fou d'environnement : par construction,
 * elle ne cible jamais que des motifs de données exclusivement créées par
 * les tests (jamais un TRUNCATE global), donc son exécution reste sans
 * risque même si elle était accidentellement pointée vers une autre base.
 * La vérification de la bonne base (TEST_DATABASE_URL, différente de
 * DATABASE_URL) est la responsabilité de l'appelant — voir
 * `tests/global-teardown.ts`.
 */
export async function cleanupTestData(prisma: PrismaClient): Promise<void> {
  await prisma.user.deleteMany({ where: { email: { endsWith: TEST_EMAIL_DOMAIN } } });

  await prisma.city.deleteMany({
    where: { OR: TEST_CITY_NAME_PREFIXES.map((prefix) => ({ name: { startsWith: prefix } })) },
  });
  await prisma.specialty.deleteMany({
    where: { OR: TEST_SPECIALTY_NAME_PREFIXES.map((prefix) => ({ name: { startsWith: prefix } })) },
  });
}
