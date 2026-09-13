import { describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/app";

/**
 * `CORS_ORIGIN` (étape 16) : liste blanche explicite en production, avec un
 * repli sur `origin: true` (comportement historique) quand la variable est
 * absente — voir `app.ts`. Chaque test construit sa propre instance avec
 * `CORS_ORIGIN` temporairement défini (restauré dans un `finally`), comme
 * `tests/rate-limit.test.ts` le fait déjà pour `NODE_ENV`, pour ne jamais
 * affecter les autres fichiers de test.
 *
 * `@fastify/cors` n'est pas un pare-feu : une origine non autorisée reçoit
 * toujours une réponse 200 (la requête aboutit côté serveur), simplement
 * sans l'en-tête `Access-Control-Allow-Origin` — c'est le navigateur qui,
 * de son côté, empêche alors le JavaScript de lire la réponse. Les tests
 * vérifient donc la présence/absence de cet en-tête, pas le code de statut.
 */
async function buildServerWithCorsOrigin(corsOrigin: string | undefined): Promise<FastifyInstance> {
  const original = process.env.CORS_ORIGIN;
  if (corsOrigin === undefined) {
    delete process.env.CORS_ORIGIN;
  } else {
    process.env.CORS_ORIGIN = corsOrigin;
  }
  try {
    const app = await buildServer();
    await app.ready();
    return app;
  } finally {
    if (original === undefined) {
      delete process.env.CORS_ORIGIN;
    } else {
      process.env.CORS_ORIGIN = original;
    }
  }
}

describe("CORS (@fastify/cors)", () => {
  it("sans CORS_ORIGIN (développement) : reflète n'importe quelle origine", async () => {
    const app = await buildServerWithCorsOrigin(undefined);
    try {
      const res = await app.inject({ method: "GET", url: "/health", headers: { origin: "http://localhost:3000" } });
      expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    } finally {
      await app.close();
    }
  });

  it("avec CORS_ORIGIN défini : autorise une origine présente dans la liste blanche", async () => {
    const app = await buildServerWithCorsOrigin("https://medilink.example,https://www.medilink.example");
    try {
      const res = await app.inject({ method: "GET", url: "/health", headers: { origin: "https://medilink.example" } });
      expect(res.headers["access-control-allow-origin"]).toBe("https://medilink.example");
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    } finally {
      await app.close();
    }
  });

  it("avec CORS_ORIGIN défini : n'autorise pas une origine absente de la liste blanche", async () => {
    const app = await buildServerWithCorsOrigin("https://medilink.example");
    try {
      const res = await app.inject({ method: "GET", url: "/health", headers: { origin: "https://attacker.example" } });
      // La requête aboutit toujours côté serveur (CORS n'est pas un pare-feu
      // serveur) : c'est l'absence de l'en-tête qui bloque le navigateur.
      expect(res.statusCode).toBe(200);
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it("avec CORS_ORIGIN défini avec plusieurs origines : chacune est acceptée indépendamment", async () => {
    const app = await buildServerWithCorsOrigin("https://medilink.example,https://www.medilink.example");
    try {
      const res = await app.inject({ method: "GET", url: "/health", headers: { origin: "https://www.medilink.example" } });
      expect(res.headers["access-control-allow-origin"]).toBe("https://www.medilink.example");
    } finally {
      await app.close();
    }
  });
});
