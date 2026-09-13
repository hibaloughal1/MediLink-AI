import { describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/app";

/**
 * Le rate-limit global (`@fastify/rate-limit`, 200 req/min) est
 * volontairement désactivé sous `NODE_ENV=test` dans `app.ts`, pour ne pas
 * gêner les autres fichiers de test qui envoient légitimement de nombreuses
 * requêtes en rafale. Cela le laissait entièrement non testé jusqu'ici.
 *
 * Ce fichier construit sa propre instance avec `NODE_ENV` temporairement
 * différent de "test" (restauré dans un `finally`), uniquement le temps de
 * ce test, pour vérifier réellement le comportement `429` — sans jamais
 * affecter les autres fichiers de test (chacun construit sa propre
 * instance Fastify indépendante via `buildServer()`).
 */
describe("Rate limiting (@fastify/rate-limit)", () => {
  it("bloque avec 429 au-delà du seuil configuré (200 req/min)", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    let app: FastifyInstance | undefined;
    try {
      app = await buildServer();
      await app.ready();

      let lastStatus = 200;
      for (let i = 0; i < 205; i += 1) {
        const res = await app.inject({ method: "GET", url: "/health" });
        lastStatus = res.statusCode;
        if (lastStatus === 429) break;
      }

      expect(lastStatus).toBe(429);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      await app?.close();
    }
  });

  it("bloque /api/auth/refresh avec 429 au-delà de sa limite dédiée (30 req/min), sans casser login/logout", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    let app: FastifyInstance | undefined;
    try {
      app = await buildServer();
      await app.ready();

      // Cookie invalide : chaque appel renvoie 401, mais le hook de
      // rate-limit s'exécute avant le handler et compte quand même la
      // requête — c'est bien ce qui est testé ici, pas la validité du jeton.
      let lastStatus = 401;
      for (let i = 0; i < 35; i += 1) {
        const res = await app.inject({ method: "POST", url: "/api/auth/refresh" });
        lastStatus = res.statusCode;
        if (lastStatus === 429) break;
      }
      expect(lastStatus).toBe(429);

      // login/register restent sur leur propre limite (10/min), non affectée
      // par celle de /refresh : un login normal continue de fonctionner.
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "nonexistent@test.medilink.local", password: "whatever123" },
      });
      expect(loginRes.statusCode).toBe(401); // identifiants invalides, pas 429
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      await app?.close();
    }
  });
});
