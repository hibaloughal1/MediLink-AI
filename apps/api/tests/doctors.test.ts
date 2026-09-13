import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/app";
import { createAdmin, createDoctorProfile, registerAndLogin, TEST_CITY_NAME_PREFIXES, TEST_SPECIALTY_NAME_PREFIXES } from "./helpers";

describe("Doctors + Specialties + Cities", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Spécialités et villes", () => {
    it("liste les spécialités", async () => {
      await app.prisma.specialty.create({ data: { name: `${TEST_SPECIALTY_NAME_PREFIXES[1]}${randomUUID()}` } });
      const res = await app.inject({ method: "GET", url: "/api/specialties" });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json().specialties)).toBe(true);
    });

    it("liste les villes", async () => {
      await app.prisma.city.create({ data: { name: `${TEST_CITY_NAME_PREFIXES[1]}${randomUUID()}` } });
      const res = await app.inject({ method: "GET", url: "/api/cities" });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json().cities)).toBe(true);
    });
  });

  describe("Création et consultation du profil médecin", () => {
    it("un DOCTOR peut créer son profil professionnel (statut PENDING par défaut)", async () => {
      const { doctorId, accessToken } = await createDoctorProfile(app);

      const meRes = await app.inject({
        method: "GET",
        url: "/api/doctors/me",
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(meRes.statusCode).toBe(200);
      expect(meRes.json().doctor.id).toBe(doctorId);
      expect(meRes.json().doctor.verificationStatus).toBe("PENDING");
    });

    it("un DOCTOR ne peut pas créer deux profils (409)", async () => {
      const { accessToken, city, specialty } = await createDoctorProfile(app);
      const res = await app.inject({
        method: "POST",
        url: "/api/doctors",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { cityId: city.id, address: "Autre adresse", specialtyIds: [specialty.id] },
      });
      expect(res.statusCode).toBe(409);
    });

    it("refuse une ville ou une spécialité inexistante (400)", async () => {
      const doctor = await registerAndLogin(app, { role: "DOCTOR" });
      const res = await app.inject({
        method: "POST",
        url: "/api/doctors",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: { cityId: randomUUID(), address: "Adresse", specialtyIds: [randomUUID()] },
      });
      expect(res.statusCode).toBe(400);
    });

    it("GET /api/doctors/me renvoie 404 tant qu'aucun profil n'est créé", async () => {
      const doctor = await registerAndLogin(app, { role: "DOCTOR" });
      const res = await app.inject({
        method: "GET",
        url: "/api/doctors/me",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it("un DOCTOR peut modifier son propre profil", async () => {
      const { accessToken } = await createDoctorProfile(app);
      const res = await app.inject({
        method: "PATCH",
        url: "/api/doctors/me",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { bio: "Nouvelle biographie" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().doctor.bio).toBe("Nouvelle biographie");
    });
  });

  describe("Visibilité publique selon le statut de vérification", () => {
    it("un médecin PENDING n'est pas visible publiquement (404 sur /:id, absent de la recherche)", async () => {
      const { doctorId, specialty } = await createDoctorProfile(app);

      const getRes = await app.inject({ method: "GET", url: `/api/doctors/${doctorId}` });
      expect(getRes.statusCode).toBe(404);

      const searchRes = await app.inject({ method: "GET", url: `/api/doctors?specialty=${encodeURIComponent(specialty.name)}` });
      expect(searchRes.json().doctors.some((d: { id: string }) => d.id === doctorId)).toBe(false);
    });

    it("un médecin VERIFIED est visible publiquement (200 sur /:id, présent dans la recherche)", async () => {
      const { doctorId, specialty, city } = await createDoctorProfile(app, { verify: true });

      const getRes = await app.inject({ method: "GET", url: `/api/doctors/${doctorId}` });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json().doctor.id).toBe(doctorId);

      const searchRes = await app.inject({ method: "GET", url: `/api/doctors?specialty=${encodeURIComponent(specialty.name)}` });
      expect(searchRes.json().doctors.some((d: { id: string }) => d.id === doctorId)).toBe(true);

      const cityRes = await app.inject({ method: "GET", url: `/api/doctors?city=${encodeURIComponent(city.name)}` });
      expect(cityRes.json().doctors.some((d: { id: string }) => d.id === doctorId)).toBe(true);
    });

    it("un médecin SUSPENDED n'est pas visible publiquement", async () => {
      const { doctorId, specialty } = await createDoctorProfile(app, { verify: true });

      // On suspend après vérification pour simuler un médecin déjà réservable
      // que l'admin retire ensuite.
      const admin = await createAdmin(app);
      const suspendRes = await app.inject({
        method: "PATCH",
        url: `/api/admin/doctors/${doctorId}/suspend`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(suspendRes.statusCode).toBe(200);
      expect(suspendRes.json().doctor.verificationStatus).toBe("SUSPENDED");

      const getRes = await app.inject({ method: "GET", url: `/api/doctors/${doctorId}` });
      expect(getRes.statusCode).toBe(404);

      const searchRes = await app.inject({ method: "GET", url: `/api/doctors?specialty=${encodeURIComponent(specialty.name)}` });
      expect(searchRes.json().doctors.some((d: { id: string }) => d.id === doctorId)).toBe(false);
    });
  });

  describe("Permissions", () => {
    it("un DOCTOR ne peut pas modifier le profil d'un autre médecin (403)", async () => {
      const doctorA = await createDoctorProfile(app);
      const doctorB = await createDoctorProfile(app);

      const res = await app.inject({
        method: "PATCH",
        url: `/api/doctors/${doctorB.doctorId}`,
        headers: { authorization: `Bearer ${doctorA.accessToken}` },
        payload: { bio: "Piraté" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("un PATIENT ne peut pas modifier un profil médecin (403)", async () => {
      const doctor = await createDoctorProfile(app);
      const patient = await registerAndLogin(app, { role: "PATIENT" });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/doctors/${doctor.doctorId}`,
        headers: { authorization: `Bearer ${patient.accessToken}` },
        payload: { bio: "Piraté" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("un DOCTOR ne peut pas modifier son propre verificationStatus (403)", async () => {
      const { accessToken, doctorId } = await createDoctorProfile(app);

      const res = await app.inject({
        method: "PATCH",
        url: "/api/doctors/me",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { verificationStatus: "VERIFIED" },
      });
      expect(res.statusCode).toBe(403);

      const check = await app.inject({
        method: "GET",
        url: "/api/doctors/me",
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(check.json().doctor.verificationStatus).toBe("PENDING");
      expect(check.json().doctor.id).toBe(doctorId);
    });

    it("un DOCTOR ne peut pas se vérifier lui-même via la route admin (403)", async () => {
      const { accessToken, doctorId } = await createDoctorProfile(app);
      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/doctors/${doctorId}/verify`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("un PATIENT ne peut pas accéder aux routes d'administration des médecins (403)", async () => {
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/doctors",
        headers: { authorization: `Bearer ${patient.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("Administration", () => {
    it("un ADMIN peut vérifier un médecin", async () => {
      const { doctorId } = await createDoctorProfile(app);
      const admin = await createAdmin(app);

      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/doctors/${doctorId}/verify`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().doctor.verificationStatus).toBe("VERIFIED");
      expect(res.json().doctor.verifiedAt).not.toBeNull();
    });

    it("un ADMIN peut suspendre un médecin", async () => {
      const { doctorId } = await createDoctorProfile(app, { verify: true });
      const admin = await createAdmin(app);

      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/doctors/${doctorId}/suspend`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().doctor.verificationStatus).toBe("SUSPENDED");
    });

    it("un ADMIN peut rejeter un médecin", async () => {
      const { doctorId } = await createDoctorProfile(app);
      const admin = await createAdmin(app);

      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/doctors/${doctorId}/reject`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().doctor.verificationStatus).toBe("REJECTED");
    });

    it("un ADMIN voit la liste complète des médecins, quel que soit leur statut", async () => {
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
  });
});
