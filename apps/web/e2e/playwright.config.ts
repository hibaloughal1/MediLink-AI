import { defineConfig } from "@playwright/test";

/**
 * Suite E2E versionnée (étape 15) — remplace les scripts ad hoc utilisés
 * jusqu'ici (écrits et exécutés hors du repository à chaque étape, jamais
 * rejouables). Suppose la pile Docker déjà démarrée :
 *
 *   docker compose --profile mail up -d
 *
 * (le profil `mail` est optionnel : sans lui, l'assertion Mailpit est
 * ignorée avec un avertissement plutôt que de faire échouer la suite —
 * voir `full-journey.spec.ts`). Ne démarre jamais la pile elle-même
 * (`webServer` volontairement absent) : orchestrer plusieurs services
 * (Postgres + API + Web [+ Mailpit]) depuis la configuration Playwright
 * ajouterait de la complexité pour un gain nul, la pile étant déjà gérée
 * par Docker Compose comme documenté dans le README racine.
 */
export default defineConfig({
  testDir: ".",
  // Un scénario complet (patient + médecin + admin, ~8 étapes, chacune
  // navigant vers une route différente) contre le serveur `next dev` de la
  // pile Docker : la première visite de chaque route déclenche une
  // compilation à la demande (plusieurs secondes), en plus du Fast Refresh
  // qui peut se déclencher pendant le test. 30s (le défaut) suffit pour une
  // seule interaction mais pas pour le parcours entier.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
