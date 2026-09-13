// Applique les migrations Prisma sur la base de test (TEST_DATABASE_URL),
// jamais sur la base de développement/seed (DATABASE_URL). Écrit en JS
// pur (pas de syntaxe shell) pour rester cross-platform (Windows/macOS/Linux).
import "dotenv/config";
import { spawnSync } from "node:child_process";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  console.error("TEST_DATABASE_URL n'est pas défini (voir .env.example).");
  process.exit(1);
}

// `directUrl` (schema.prisma, étape 16 — requis pour un pooler type
// Supabase/PgBouncer) est ce que le moteur de migration Prisma utilise
// réellement pour `migrate deploy`, pas `url`. Sans l'écraser ici aussi,
// cette commande utiliserait le DIRECT_URL hérité de l'environnement (celui
// de la base de développement) au lieu de la base de test, malgré le
// DATABASE_URL redéfini ci-dessous — violerait silencieusement l'isolation
// stricte tests/développement. En local, pas de pooler : la base de test
// n'a qu'une seule connexion, donc DIRECT_URL = TEST_DATABASE_URL ici aussi.
const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DATABASE_URL: testDatabaseUrl, DIRECT_URL: testDatabaseUrl },
});

process.exit(result.status ?? 1);
