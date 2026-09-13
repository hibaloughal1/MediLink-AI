import { describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/app";

describe("Security headers", () => {
  it("ajoute X-Content-Type-Options et Referrer-Policy sur toute réponse", async () => {
    const app = await buildServer();
    try {
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["referrer-policy"]).toBe("no-referrer");
    } finally {
      await app.close();
    }
  });

  it("n'ajoute pas Strict-Transport-Security sur une requête HTTP simple", async () => {
    const app = await buildServer();
    try {
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.headers["strict-transport-security"]).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it("ajoute Strict-Transport-Security quand la requête est reçue en HTTPS", async () => {
    let app: FastifyInstance | undefined;
    try {
      app = await buildServer();
      // `app.inject` ne simule pas une vraie connexion TLS ; on force
      // artificiellement `request.protocol` via un hook pour vérifier la
      // branche conditionnelle sans dépendre d'une infrastructure HTTPS
      // réelle dans les tests.
      app.addHook("onRequest", async (request) => {
        Object.defineProperty(request, "protocol", { value: "https", configurable: true });
      });
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.headers["strict-transport-security"]).toBe("max-age=15552000; includeSubDomains");
    } finally {
      await app?.close();
    }
  });
});
