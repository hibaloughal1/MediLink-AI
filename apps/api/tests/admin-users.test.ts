import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/app";
import { REFRESH_COOKIE_NAME } from "../src/plugins/auth";
import { createAdmin, createDoctorProfile, registerAndLogin } from "./helpers";

describe("Administration des utilisateurs", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Suspension", () => {
    it("un ADMIN peut suspendre un PATIENT (200, status SUSPENDED)", async () => {
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const admin = await createAdmin(app);

      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${patient.user.id}/suspend`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().user.status).toBe("SUSPENDED");
    });

    it("un ADMIN peut suspendre un DOCTOR (200, status SUSPENDED)", async () => {
      const doctor = await createDoctorProfile(app);
      const admin = await createAdmin(app);

      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${doctor.user.id}/suspend`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().user.status).toBe("SUSPENDED");
    });

    it("la suspension révoque les refresh tokens actifs de l'utilisateur", async () => {
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const admin = await createAdmin(app);

      const before = await app.prisma.refreshToken.findMany({ where: { userId: patient.user.id } });
      expect(before.length).toBeGreaterThan(0);
      expect(before.every((t) => t.revokedAt === null)).toBe(true);

      const suspendRes = await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${patient.user.id}/suspend`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(suspendRes.statusCode).toBe(200);

      const after = await app.prisma.refreshToken.findMany({ where: { userId: patient.user.id } });
      expect(after.every((t) => t.revokedAt !== null)).toBe(true);
    });

    it("le login d'un utilisateur suspendu échoue (401)", async () => {
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const admin = await createAdmin(app);

      const suspendRes = await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${patient.user.id}/suspend`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(suspendRes.statusCode).toBe(200);

      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: patient.email, password: patient.password },
      });
      expect(loginRes.statusCode).toBe(401);
    });

    it("le refresh d'un token émis avant la suspension échoue ensuite (401)", async () => {
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const admin = await createAdmin(app);

      const suspendRes = await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${patient.user.id}/suspend`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(suspendRes.statusCode).toBe(200);

      const refreshRes = await app.inject({
        method: "POST",
        url: "/api/auth/refresh",
        cookies: { [REFRESH_COOKIE_NAME]: patient.refreshCookie! },
      });
      expect(refreshRes.statusCode).toBe(401);
    });

    it("suspendre son propre compte est refusé (403)", async () => {
      const admin = await createAdmin(app);

      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${admin.user.id}/suspend`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("suspendre un autre ADMIN est refusé (403)", async () => {
      const targetAdmin = await createAdmin(app);
      const actingAdmin = await createAdmin(app);

      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${targetAdmin.user.id}/suspend`,
        headers: { authorization: `Bearer ${actingAdmin.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("suspendre un utilisateur inexistant renvoie 404", async () => {
      const admin = await createAdmin(app);

      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${randomUUID()}/suspend`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it("suspendre un compte déjà suspendu renvoie 409", async () => {
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const admin = await createAdmin(app);

      const first = await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${patient.user.id}/suspend`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(first.statusCode).toBe(200);

      const second = await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${patient.user.id}/suspend`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(second.statusCode).toBe(409);
    });

    it("PATIENT et DOCTOR n'ont pas accès aux routes d'administration des utilisateurs (403)", async () => {
      const target = await registerAndLogin(app, { role: "PATIENT" });
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const doctor = await registerAndLogin(app, { role: "DOCTOR" });

      const asPatient = await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${target.user.id}/suspend`,
        headers: { authorization: `Bearer ${patient.accessToken}` },
      });
      expect(asPatient.statusCode).toBe(403);

      const asDoctor = await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${target.user.id}/suspend`,
        headers: { authorization: `Bearer ${doctor.accessToken}` },
      });
      expect(asDoctor.statusCode).toBe(403);
    });
  });

  describe("Réactivation", () => {
    it("un ADMIN peut réactiver un compte suspendu, le login redevient possible", async () => {
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const admin = await createAdmin(app);

      const suspendRes = await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${patient.user.id}/suspend`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(suspendRes.statusCode).toBe(200);

      const reactivateRes = await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${patient.user.id}/reactivate`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(reactivateRes.statusCode).toBe(200);
      expect(reactivateRes.json().user.status).toBe("ACTIVE");

      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: patient.email, password: patient.password },
      });
      expect(loginRes.statusCode).toBe(200);
    });

    it("réactiver un utilisateur inexistant renvoie 404", async () => {
      const admin = await createAdmin(app);
      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${randomUUID()}/reactivate`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it("réactiver un compte déjà actif renvoie 409", async () => {
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const admin = await createAdmin(app);

      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${patient.user.id}/reactivate`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(409);
    });

    it("PATIENT et DOCTOR n'ont pas accès à la réactivation (403)", async () => {
      const target = await registerAndLogin(app, { role: "PATIENT" });
      const patient = await registerAndLogin(app, { role: "PATIENT" });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${target.user.id}/reactivate`,
        headers: { authorization: `Bearer ${patient.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("Filtres de liste (rétrocompatibles)", () => {
    it("GET /api/users sans filtre continue de fonctionner comme avant", async () => {
      const admin = await createAdmin(app);
      const res = await app.inject({
        method: "GET",
        url: "/api/users",
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json().users)).toBe(true);
      expect(res.json().page).toBe(1);
      expect(res.json().pageSize).toBe(20);
    });

    it("GET /api/users?role=DOCTOR ne renvoie que des médecins", async () => {
      const doctor = await registerAndLogin(app, { role: "DOCTOR" });
      const admin = await createAdmin(app);

      const res = await app.inject({
        method: "GET",
        url: "/api/users?role=DOCTOR&pageSize=100",
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const users = res.json().users as { id: string; role: string }[];
      expect(users.some((u) => u.id === doctor.user.id)).toBe(true);
      expect(users.every((u) => u.role === "DOCTOR")).toBe(true);
    });

    it("GET /api/users?status=SUSPENDED ne renvoie que des comptes suspendus", async () => {
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const admin = await createAdmin(app);
      await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${patient.user.id}/suspend`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/users?status=SUSPENDED&pageSize=100",
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const users = res.json().users as { id: string; status: string }[];
      expect(users.some((u) => u.id === patient.user.id)).toBe(true);
      expect(users.every((u) => u.status === "SUSPENDED")).toBe(true);
    });

    it("GET /api/admin/doctors sans filtre continue de fonctionner comme avant", async () => {
      const { doctorId } = await createDoctorProfile(app);
      const admin = await createAdmin(app);

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/doctors",
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().doctors.some((d: { id: string }) => d.id === doctorId)).toBe(true);
    });

    it("GET /api/admin/doctors?status=PENDING ne renvoie que des médecins PENDING", async () => {
      const { doctorId: pendingId } = await createDoctorProfile(app);
      const { doctorId: verifiedId } = await createDoctorProfile(app, { verify: true });
      const admin = await createAdmin(app);

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/doctors?status=PENDING&limit=100",
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const doctors = res.json().doctors as { id: string; verificationStatus: string }[];
      expect(doctors.some((d) => d.id === pendingId)).toBe(true);
      expect(doctors.some((d) => d.id === verifiedId)).toBe(false);
      expect(doctors.every((d) => d.verificationStatus === "PENDING")).toBe(true);
    });
  });

  describe("Effet d'une suspension utilisateur sur la visibilité d'un médecin (comportement déjà garanti par l'API existante)", () => {
    it("Doctor VERIFIED + User ACTIVE : profil visible publiquement", async () => {
      const { doctorId } = await createDoctorProfile(app, { verify: true });

      const res = await app.inject({ method: "GET", url: `/api/doctors/${doctorId}` });
      expect(res.statusCode).toBe(200);
    });

    it("Doctor VERIFIED + User SUSPENDED : profil non visible publiquement et non réservable", async () => {
      const doctor = await createDoctorProfile(app, { verify: true });
      const admin = await createAdmin(app);

      const suspendRes = await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${doctor.user.id}/suspend`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(suspendRes.statusCode).toBe(200);

      const getRes = await app.inject({ method: "GET", url: `/api/doctors/${doctor.doctorId}` });
      expect(getRes.statusCode).toBe(404);

      const searchRes = await app.inject({
        method: "GET",
        url: `/api/doctors?specialty=${encodeURIComponent(doctor.specialty.name)}`,
      });
      expect(searchRes.json().doctors.some((d: { id: string }) => d.id === doctor.doctorId)).toBe(false);

      const availabilityRes = await app.inject({
        method: "GET",
        url: `/api/doctors/${doctor.doctorId}/availability?from=2026-01-01&to=2026-01-07`,
      });
      expect(availabilityRes.statusCode).toBe(404);
    });

    it("après réactivation (User SUSPENDED -> ACTIVE), le médecin redevient visible si toujours VERIFIED", async () => {
      const doctor = await createDoctorProfile(app, { verify: true });
      const admin = await createAdmin(app);

      await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${doctor.user.id}/suspend`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });

      const reactivateRes = await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${doctor.user.id}/reactivate`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(reactivateRes.statusCode).toBe(200);

      const getRes = await app.inject({ method: "GET", url: `/api/doctors/${doctor.doctorId}` });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json().doctor.id).toBe(doctor.doctorId);

      const searchRes = await app.inject({
        method: "GET",
        url: `/api/doctors?specialty=${encodeURIComponent(doctor.specialty.name)}`,
      });
      expect(searchRes.json().doctors.some((d: { id: string }) => d.id === doctor.doctorId)).toBe(true);
    });
  });
});
