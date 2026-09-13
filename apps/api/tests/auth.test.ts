import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/app";
import { REFRESH_COOKIE_NAME } from "../src/plugins/auth";
import { createAdmin, registerAndLogin, uniqueEmail } from "./helpers";

describe("Auth + Users", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /api/auth/register", () => {
    it("crée un compte patient et ne renvoie jamais le mot de passe", async () => {
      const email = uniqueEmail("register");
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email, password: "correct-horse-battery", firstName: "Ada", lastName: "Lovelace" },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.user.email).toBe(email);
      expect(body.user.role).toBe("PATIENT");
      expect(body.user.passwordHash).toBeUndefined();
    });

    it("refuse un e-mail déjà utilisé (409)", async () => {
      const email = uniqueEmail("dup");
      const payload = { email, password: "correct-horse-battery", firstName: "A", lastName: "B" };

      const first = await app.inject({ method: "POST", url: "/api/auth/register", payload });
      expect(first.statusCode).toBe(201);

      const second = await app.inject({ method: "POST", url: "/api/auth/register", payload });
      expect(second.statusCode).toBe(409);
    });

    it("refuse la création d'un compte ADMIN via l'inscription publique (400)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: uniqueEmail("wannabe-admin"),
          password: "correct-horse-battery",
          firstName: "A",
          lastName: "B",
          role: "ADMIN",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("refuse un mot de passe trop court (400)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email: uniqueEmail("shortpw"), password: "abc", firstName: "A", lastName: "B" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /api/auth/login", () => {
    it("connecte un utilisateur avec les bons identifiants", async () => {
      const { accessToken } = await registerAndLogin(app);
      expect(typeof accessToken).toBe("string");
      expect(accessToken.length).toBeGreaterThan(10);
    });

    it("rejette un mauvais mot de passe (401, message générique)", async () => {
      const email = uniqueEmail("badpw");
      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email, password: "correct-horse-battery", firstName: "A", lastName: "B" },
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email, password: "wrong-password" },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().message).toBe("Identifiants invalides.");
    });

    it("rejette un utilisateur inexistant (401, même message générique)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: uniqueEmail("ghost"), password: "whatever123" },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().message).toBe("Identifiants invalides.");
    });
  });

  describe("Protection des routes", () => {
    it("refuse l'accès à une route protégée sans token (401)", async () => {
      const res = await app.inject({ method: "GET", url: "/api/users/me" });
      expect(res.statusCode).toBe(401);
    });

    it("refuse un token invalide (401)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/users/me",
        headers: { authorization: "Bearer not-a-valid-token" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("autorise l'accès avec un access token valide", async () => {
      const { accessToken, user } = await registerAndLogin(app);
      const res = await app.inject({
        method: "GET",
        url: "/api/users/me",
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().user.id).toBe(user.id);
    });

    it("permet de mettre à jour son propre profil via /me", async () => {
      const { accessToken } = await registerAndLogin(app);
      const res = await app.inject({
        method: "PATCH",
        url: "/api/users/me",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { firstName: "Updated" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().user.firstName).toBe("Updated");
    });
  });

  describe("RBAC par rôle", () => {
    it("rôle PATIENT : ne peut pas lister les utilisateurs (403)", async () => {
      const { accessToken } = await registerAndLogin(app, { role: "PATIENT" });
      const res = await app.inject({
        method: "GET",
        url: "/api/users",
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("rôle DOCTOR : ne peut pas lister les utilisateurs (403)", async () => {
      const { accessToken } = await registerAndLogin(app, { role: "DOCTOR" });
      const res = await app.inject({
        method: "GET",
        url: "/api/users",
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("rôle ADMIN : peut lister les utilisateurs (200)", async () => {
      const { accessToken } = await createAdmin(app);
      const res = await app.inject({
        method: "GET",
        url: "/api/users",
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json().users)).toBe(true);
    });
  });

  describe("Permissions inter-utilisateurs (protection IDOR)", () => {
    it("un patient ne peut pas lire le profil d'un autre utilisateur via /:id (403)", async () => {
      const patientA = await registerAndLogin(app);
      const patientB = await registerAndLogin(app);

      const res = await app.inject({
        method: "GET",
        url: `/api/users/${patientB.user.id}`,
        headers: { authorization: `Bearer ${patientA.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("un patient ne peut pas modifier le profil d'un autre utilisateur en changeant l'id dans l'URL (403)", async () => {
      const patientA = await registerAndLogin(app);
      const patientB = await registerAndLogin(app);

      const res = await app.inject({
        method: "PATCH",
        url: `/api/users/${patientB.user.id}`,
        headers: { authorization: `Bearer ${patientA.accessToken}` },
        payload: { firstName: "Hacked" },
      });

      expect(res.statusCode).toBe(403);

      // Le profil de la victime n'a pas changé.
      const check = await app.inject({
        method: "GET",
        url: "/api/users/me",
        headers: { authorization: `Bearer ${patientB.accessToken}` },
      });
      expect(check.json().user.firstName).not.toBe("Hacked");
    });

    it("un médecin ne peut pas modifier le profil d'un patient via /:id (403)", async () => {
      const doctor = await registerAndLogin(app, { role: "DOCTOR" });
      const patient = await registerAndLogin(app, { role: "PATIENT" });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/users/${patient.user.id}`,
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: { firstName: "Hacked" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("un ADMIN peut consulter et modifier le profil d'un autre utilisateur", async () => {
      const admin = await createAdmin(app);
      const patient = await registerAndLogin(app);

      const getRes = await app.inject({
        method: "GET",
        url: `/api/users/${patient.user.id}`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(getRes.statusCode).toBe(200);

      const patchRes = await app.inject({
        method: "PATCH",
        url: `/api/users/${patient.user.id}`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
        payload: { firstName: "EditedByAdmin" },
      });
      expect(patchRes.statusCode).toBe(200);
      expect(patchRes.json().user.firstName).toBe("EditedByAdmin");
    });
  });

  describe("Refresh & logout", () => {
    it("émet un nouvel access token via le cookie de refresh", async () => {
      const { refreshCookie } = await registerAndLogin(app);
      expect(refreshCookie).toBeTruthy();

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/refresh",
        cookies: { [REFRESH_COOKIE_NAME]: refreshCookie! },
      });

      expect(res.statusCode).toBe(200);
      expect(typeof res.json().accessToken).toBe("string");
    });

    it("révoque le refresh token à la déconnexion (le refresh suivant échoue)", async () => {
      const { accessToken, refreshCookie } = await registerAndLogin(app);

      const logoutRes = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { authorization: `Bearer ${accessToken}` },
        cookies: { [REFRESH_COOKIE_NAME]: refreshCookie! },
      });
      expect(logoutRes.statusCode).toBe(204);

      const refreshAfterLogout = await app.inject({
        method: "POST",
        url: "/api/auth/refresh",
        cookies: { [REFRESH_COOKIE_NAME]: refreshCookie! },
      });
      expect(refreshAfterLogout.statusCode).toBe(401);
    });

    it("rotation : réutiliser un refresh token déjà consommé échoue (401)", async () => {
      const { refreshCookie } = await registerAndLogin(app);

      const first = await app.inject({
        method: "POST",
        url: "/api/auth/refresh",
        cookies: { [REFRESH_COOKIE_NAME]: refreshCookie! },
      });
      expect(first.statusCode).toBe(200);

      // Même cookie qu'au premier appel : déjà révoqué par la rotation.
      const reuse = await app.inject({
        method: "POST",
        url: "/api/auth/refresh",
        cookies: { [REFRESH_COOKIE_NAME]: refreshCookie! },
      });
      expect(reuse.statusCode).toBe(401);
    });

    it("refuse un refresh sans cookie (401)", async () => {
      const res = await app.inject({ method: "POST", url: "/api/auth/refresh" });
      expect(res.statusCode).toBe(401);
    });
  });
});
