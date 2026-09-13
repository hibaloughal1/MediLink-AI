import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Sans `globals: true` dans vitest.config.ts, le nettoyage automatique de
// @testing-library/react entre chaque test ne s'enregistre pas tout seul :
// on l'active explicitement pour éviter l'accumulation de rendus DOM d'un
// test à l'autre (source de faux échecs "multiple elements found").
afterEach(() => {
  cleanup();
});
