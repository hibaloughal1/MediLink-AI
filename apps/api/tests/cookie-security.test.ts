import { describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/app";
import { uniqueEmail } from "./helpers";

/**
 * `secure` sur le cookie de refresh (`refreshCookieOptions`,
 * `auth.routes.ts`) dépend de `NODE_ENV` : jamais actif en développement
 * (HTTP local sans TLS), toujours actif en production. Comme
 * `tests/rate-limit.test.ts`, ce fichier construit sa propre instance avec
 * `NODE_ENV` temporairement modifié (restauré dans un `finally`) pour
 * vérifier réellement les deux branches, plutôt que de ne tester que celle
 * exercée par défaut sous test.
 */
async function registerAndLoginWithNodeEnv(app: FastifyInstance, nodeEnv: string) {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;
  try {
    const email = uniqueEmail("cookie-security");
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password: "correct-horse-battery", firstName: "Cookie", lastName: "Security" },
    });
    // `await` impératif ici : sans lui, le `finally` ci-dessous restaure
    // NODE_ENV avant que le handler de la route (asynchrone) n'ait
    // réellement lu sa valeur, faussant systématiquement le test.
    return await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password: "correct-horse-battery" },
    });
  } finally {
    process.env.NODE_ENV = original;
  }
}

function setCookieString(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers["set-cookie"];
  return Array.isArray(raw) ? raw[0] : String(raw ?? "");
}

describe("Cookie de refresh : attribut Secure selon l'environnement", () => {
  it("n'inclut pas Secure en développement (NODE_ENV=development)", async () => {
    const app = await buildServer();
    try {
      const res = await registerAndLoginWithNodeEnv(app, "development");
      const cookie = setCookieString(res);
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).not.toMatch(/;\s*Secure/i);
    } finally {
      await app.close();
    }
  });

  it("inclut Secure en production (NODE_ENV=production)", async () => {
    const app = await buildServer();
    try {
      const res = await registerAndLoginWithNodeEnv(app, "production");
      const cookie = setCookieString(res);
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).toMatch(/;\s*Secure/i);
    } finally {
      await app.close();
    }
  });

  it("le cookie est toujours scopé à /api/auth, dans les deux environnements", async () => {
    const app = await buildServer();
    try {
      const devCookie = setCookieString(await registerAndLoginWithNodeEnv(app, "development"));
      const prodCookie = setCookieString(await registerAndLoginWithNodeEnv(app, "production"));
      expect(devCookie).toContain("Path=/api/auth");
      expect(prodCookie).toContain("Path=/api/auth");
    } finally {
      await app.close();
    }
  });
});
