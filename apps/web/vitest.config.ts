import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    // La suite Playwright (apps/web/e2e) a son propre runner et son propre
    // fichier de test (*.spec.ts) : sans cette exclusion, Vitest la
    // découvre aussi et échoue (`test()` de Playwright appelé hors de son
    // runner).
    exclude: ["**/node_modules/**", "**/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["app/**/*.tsx", "components/**/*.tsx", "lib/**/*.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
