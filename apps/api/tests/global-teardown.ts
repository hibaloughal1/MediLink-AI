import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { cleanupTestData } from "./test-data-cleanup.js";

/**
 * Nettoyage de fin de suite (Vitest `globalSetup`, fonction `teardown`),
 * exécuté UNE SEULE FOIS après que TOUS les fichiers de test ont terminé —
 * jamais depuis le `afterAll` d'un fichier individuel. Les fichiers de test
 * s'exécutent en parallèle par défaut sous Vitest et partagent tous la même
 * base `TEST_DATABASE_URL` : un nettoyage par fichier supprimerait les
 * données d'un autre fichier encore en cours d'exécution (voir le
 * commentaire de `cleanupTestData` dans `tests/helpers.ts` pour le détail
 * du problème concrètement rencontré).
 *
 * Garde-fous, en plus de la sécurité déjà intrinsèque à `cleanupTestData`
 * (qui ne cible jamais que des motifs de données créées par les tests,
 * jamais un TRUNCATE global) :
 *  - échoue explicitement si `TEST_DATABASE_URL` est absent, plutôt que de
 *    deviner une base par défaut ;
 *  - refuse de s'exécuter si `TEST_DATABASE_URL` est identique à
 *    `DATABASE_URL` (protection contre une mauvaise configuration locale
 *    qui pointerait les tests vers la base de développement).
 */
export async function teardown(): Promise<void> {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL n'est pas défini : le nettoyage de fin de suite ne peut pas s'exécuter en sécurité.");
  }
  if (testDatabaseUrl === process.env.DATABASE_URL) {
    throw new Error(
      "TEST_DATABASE_URL est identique à DATABASE_URL : refus de nettoyer pour ne jamais risquer de toucher la base de développement.",
    );
  }

  const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  try {
    await cleanupTestData(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
