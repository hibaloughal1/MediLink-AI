import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/app";
import { createAdmin, createVerifiedDoctorWithAvailability, getSlots, nextDateForDayOfWeek, registerAndLogin } from "./helpers";

/**
 * Audit RBAC ciblé (étape 15) : les fichiers existants (`appointments.test.ts`,
 * `availability.test.ts`, `doctors.test.ts`, `auth.test.ts`, `admin-users.test.ts`)
 * couvrent déjà 25 cas 403 au cas par cas. Une relecture systématique de
 * chaque route protégée par rôle, comparée à ces tests existants, a
 * identifié précisément les combinaisons (rôle x route) encore non
 * couvertes — ce fichier comble EXCLUSIVEMENT ces trous, sans dupliquer ce
 * qui est déjà vérifié ailleurs :
 *
 *  - `POST /api/appointments` (PATIENT uniquement) : ADMIN jamais testé.
 *  - `GET /api/doctors/me/appointments` (DOCTOR uniquement) : ADMIN jamais testé
 *    (seul PATIENT l'était).
 *  - `/api/doctors/me/availability` (DOCTOR uniquement, 4 routes) : ADMIN
 *    jamais testé du tout (seuls PATIENT et un DOCTOR non-propriétaire
 *    l'étaient).
 *  - `GET /api/doctors/me` et `POST /api/doctors` (DOCTOR uniquement) :
 *    PATIENT et ADMIN jamais testés (seule `PATCH /:id`, une route
 *    différente, l'était pour PATIENT).
 */
describe("Audit RBAC — combinaisons rôle x route non couvertes ailleurs", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("un ADMIN ne peut pas réserver de rendez-vous via POST /api/appointments (403)", async () => {
    const admin = await createAdmin(app);
    const doctor = await createVerifiedDoctorWithAvailability(app, { dayOfWeek: 1 });
    const date = nextDateForDayOfWeek(1);
    const [slot] = await getSlots(app, doctor.doctorId, date);

    const res = await app.inject({
      method: "POST",
      url: "/api/appointments",
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: { doctorId: doctor.doctorId, startAt: slot.startAt, endAt: slot.endAt },
    });
    expect(res.statusCode).toBe(403);
  });

  it("un ADMIN ne peut pas accéder à l'agenda médecin via GET /api/doctors/me/appointments (403)", async () => {
    const admin = await createAdmin(app);
    const res = await app.inject({
      method: "GET",
      url: "/api/doctors/me/appointments",
      headers: { authorization: `Bearer ${admin.accessToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  describe("/api/doctors/me/availability — ADMIN jamais testé jusqu'ici", () => {
    it("GET : refuse un ADMIN (403)", async () => {
      const admin = await createAdmin(app);
      const res = await app.inject({
        method: "GET",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("POST : refuse un ADMIN (403)", async () => {
      const admin = await createAdmin(app);
      const res = await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${admin.accessToken}` },
        payload: { type: "RECURRING", dayOfWeek: 1, startTime: "09:00", endTime: "12:00", slotDurationMinutes: 30, effectiveFrom: new Date().toISOString().slice(0, 10) },
      });
      expect(res.statusCode).toBe(403);
    });

    it("PATCH : refuse un ADMIN, y compris sur une règle existante d'un vrai médecin (403)", async () => {
      const admin = await createAdmin(app);
      const doctor = await createVerifiedDoctorWithAvailability(app, { dayOfWeek: 2 });
      const rules = await app.inject({
        method: "GET",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
      });
      const ruleId = rules.json().availability[0].id;

      const res = await app.inject({
        method: "PATCH",
        url: `/api/doctors/me/availability/${ruleId}`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
        payload: { startTime: "08:00" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("DELETE : refuse un ADMIN, y compris sur une règle existante d'un vrai médecin (403)", async () => {
      const admin = await createAdmin(app);
      const doctor = await createVerifiedDoctorWithAvailability(app, { dayOfWeek: 3 });
      const rules = await app.inject({
        method: "GET",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
      });
      const ruleId = rules.json().availability[0].id;

      const res = await app.inject({
        method: "DELETE",
        url: `/api/doctors/me/availability/${ruleId}`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("GET /api/doctors/me et POST /api/doctors — PATIENT et ADMIN jamais testés", () => {
    it("GET /api/doctors/me : refuse un PATIENT (403)", async () => {
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const res = await app.inject({
        method: "GET",
        url: "/api/doctors/me",
        headers: { authorization: `Bearer ${patient.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("GET /api/doctors/me : refuse un ADMIN (403)", async () => {
      const admin = await createAdmin(app);
      const res = await app.inject({
        method: "GET",
        url: "/api/doctors/me",
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("POST /api/doctors : refuse un PATIENT (403)", async () => {
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const res = await app.inject({
        method: "POST",
        url: "/api/doctors",
        headers: { authorization: `Bearer ${patient.accessToken}` },
        payload: { cityId: "00000000-0000-0000-0000-000000000000", address: "Adresse", specialtyIds: ["00000000-0000-0000-0000-000000000000"] },
      });
      expect(res.statusCode).toBe(403);
    });

    it("POST /api/doctors : refuse un ADMIN (403)", async () => {
      const admin = await createAdmin(app);
      const res = await app.inject({
        method: "POST",
        url: "/api/doctors",
        headers: { authorization: `Bearer ${admin.accessToken}` },
        payload: { cityId: "00000000-0000-0000-0000-000000000000", address: "Adresse", specialtyIds: ["00000000-0000-0000-0000-000000000000"] },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
