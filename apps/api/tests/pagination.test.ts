import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/app";
import { createAdmin, registerAndLogin } from "./helpers";

/**
 * Bornes de pagination — trois schémas Zod distincts partagent le même
 * motif (`page`/`limit` ou `pageSize`, min 1, max 100) : `listAppointmentsQuerySchema`,
 * `searchDoctorsQuerySchema`, `adminListUsersQuerySchema`. Un représentant
 * de chacun suffit à couvrir le motif sans dupliquer le même test sur les
 * 7 endpoints paginés de l'API (comportement structurellement identique).
 */
describe("Pagination — bornes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /api/appointments/me (limit/page)", () => {
    it("accepte limit=100 (borne maximale exacte)", async () => {
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const res = await app.inject({
        method: "GET",
        url: "/api/appointments/me?limit=100",
        headers: { authorization: `Bearer ${patient.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it("refuse limit=101 (au-delà de la borne maximale) avec 400", async () => {
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const res = await app.inject({
        method: "GET",
        url: "/api/appointments/me?limit=101",
        headers: { authorization: `Bearer ${patient.accessToken}` },
      });
      expect(res.statusCode).toBe(400);
    });

    it("refuse limit=0 (en dessous de la borne minimale) avec 400", async () => {
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const res = await app.inject({
        method: "GET",
        url: "/api/appointments/me?limit=0",
        headers: { authorization: `Bearer ${patient.accessToken}` },
      });
      expect(res.statusCode).toBe(400);
    });

    it("refuse page=0 avec 400", async () => {
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const res = await app.inject({
        method: "GET",
        url: "/api/appointments/me?page=0",
        headers: { authorization: `Bearer ${patient.accessToken}` },
      });
      expect(res.statusCode).toBe(400);
    });

    it("une page au-delà du total renvoie 200 avec une liste vide, jamais une erreur", async () => {
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const res = await app.inject({
        method: "GET",
        url: "/api/appointments/me?page=999",
        headers: { authorization: `Bearer ${patient.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().appointments).toEqual([]);
    });
  });

  describe("GET /api/doctors (recherche publique, limit/page)", () => {
    it("accepte limit=100", async () => {
      const res = await app.inject({ method: "GET", url: "/api/doctors?limit=100" });
      expect(res.statusCode).toBe(200);
    });

    it("refuse limit=101 avec 400", async () => {
      const res = await app.inject({ method: "GET", url: "/api/doctors?limit=101" });
      expect(res.statusCode).toBe(400);
    });

    it("une page au-delà du total renvoie 200 avec une liste vide", async () => {
      const res = await app.inject({ method: "GET", url: "/api/doctors?page=999" });
      expect(res.statusCode).toBe(200);
      expect(res.json().doctors).toEqual([]);
    });
  });

  describe("GET /api/users (admin, page/pageSize — nom de champ différent)", () => {
    it("accepte pageSize=100", async () => {
      const admin = await createAdmin(app);
      const res = await app.inject({
        method: "GET",
        url: "/api/users?pageSize=100",
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it("refuse pageSize=101 avec 400", async () => {
      const admin = await createAdmin(app);
      const res = await app.inject({
        method: "GET",
        url: "/api/users?pageSize=101",
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(400);
    });

    it("une page au-delà du total renvoie 200 avec une liste vide", async () => {
      const admin = await createAdmin(app);
      const res = await app.inject({
        method: "GET",
        url: "/api/users?page=999",
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().users).toEqual([]);
    });
  });
});
