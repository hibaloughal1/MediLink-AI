import { describe, expect, it } from "vitest";
import { Writable } from "node:stream";
import { buildServer } from "../src/app";
import { uniqueEmail } from "./helpers";

/**
 * Vérifie la configuration réelle de redaction du logger de `buildServer`
 * (étape 16) de bout en bout : on capture la sortie brute du logger
 * Fastify/pino de l'instance construite par l'application elle-même (via
 * le second paramètre test-only de `buildServer`), puis on effectue de
 * vraies requêtes portant un en-tête `Authorization`/`Cookie` sensible et
 * une connexion qui pose un cookie `Set-Cookie` — exactement le chemin
 * réel emprunté par le trafic de production (`app.ts` loggue chaque
 * requête/réponse automatiquement).
 */
function collectingStream() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { stream, lines };
}

describe("Logger redaction (pino redact)", () => {
  it("masque Authorization et Cookie dans le log d'une requête entrante", async () => {
    const { stream, lines } = collectingStream();
    const app = await buildServer(stream);
    try {
      const fakeAccessToken = "super-secret-access-token-value";
      const fakeCookieValue = "medilink_refresh=super-secret-refresh-cookie-value";

      await app.inject({
        method: "GET",
        url: "/api/users/me",
        headers: { authorization: `Bearer ${fakeAccessToken}`, cookie: fakeCookieValue },
      });

      const output = lines.join("\n");
      expect(output).not.toContain(fakeAccessToken);
      expect(output).not.toContain("super-secret-refresh-cookie-value");
      expect(output).toContain("[REDACTED]");
    } finally {
      await app.close();
    }
  });

  it("masque Set-Cookie dans le log de la réponse à /api/auth/login", async () => {
    const { stream, lines } = collectingStream();
    const app = await buildServer(stream);
    try {
      const email = uniqueEmail("logger-redaction");
      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email, password: "correct-horse-battery", firstName: "Log", lastName: "Redaction" },
      });
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email, password: "correct-horse-battery" },
      });
      const setCookieHeader = loginRes.headers["set-cookie"];
      expect(setCookieHeader).toBeTruthy();
      const rawCookieValue = (Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader)!.split(";")[0].split("=")[1];

      const output = lines.join("\n");
      expect(output).not.toContain(rawCookieValue);
      expect(output).toContain("[REDACTED]");
    } finally {
      await app.close();
    }
  });

  it("le comportement normal de l'API n'est pas affecté par la config de redaction", async () => {
    const { stream } = collectingStream();
    const app = await buildServer(stream);
    try {
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: "ok", service: "medilink-api" });
    } finally {
      await app.close();
    }
  });
});
