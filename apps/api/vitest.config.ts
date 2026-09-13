import "dotenv/config";
import { defineConfig } from "vitest/config";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL n'est pas défini (voir apps/api/.env.example). " +
      "Les tests ne doivent jamais tourner contre la base de développement/seed.",
  );
}

export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
      // Toujours faire tourner les tests contre une base dédiée, jamais
      // contre DATABASE_URL (développement/seed), pour ne pas la polluer.
      DATABASE_URL: testDatabaseUrl,
    },
    testTimeout: 15000,
    // Nettoyage des données créées par les tests, exécuté UNE SEULE FOIS
    // après que tous les fichiers de test (parallélisés par défaut) ont
    // terminé — voir tests/global-teardown.ts et tests/helpers.ts
    // (cleanupTestData) pour le détail de la stratégie et des garde-fous.
    globalSetup: ["./tests/global-teardown.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
    },
  },
});
