import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/app";
import { createAdmin, createDoctorProfile, registerAndLogin } from "./helpers";
import { isSlotBookable } from "../src/modules/availability/availability.service";
import { addCalendarDays } from "../src/lib/timezone";

/** Prochain jour de semaine (0=dimanche..6=samedi) à partir d'aujourd'hui, en excluant aujourd'hui même. */
function nextDateForDayOfWeek(dayOfWeek: number): string {
  const today = new Date();
  let date = addCalendarDays(today.toISOString().slice(0, 10), 1);
  while (new Date(`${date}T00:00:00.000Z`).getUTCDay() !== dayOfWeek) {
    date = addCalendarDays(date, 1);
  }
  return date;
}

const TODAY = new Date().toISOString().slice(0, 10);
const FAR_FUTURE = addCalendarDays(TODAY, 40);

describe("Availability", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Création — cas nominaux", () => {
    it("1. crée une disponibilité récurrente normale et génère les créneaux attendus", async () => {
      const doctor = await createDoctorProfile(app, { verify: true });
      const targetDate = nextDateForDayOfWeek(1); // un lundi futur

      const createRes = await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: {
          type: "RECURRING",
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "12:00",
          slotDurationMinutes: 30,
          effectiveFrom: TODAY,
        },
      });
      expect(createRes.statusCode).toBe(201);

      const res = await app.inject({ method: "GET", url: `/api/doctors/${doctor.doctorId}/availability?from=${targetDate}&to=${targetDate}` });
      expect(res.statusCode).toBe(200);
      const times = res.json().slots.map((s: { startAt: string }) => s.startAt);
      expect(times).toHaveLength(6); // 09:00 09:30 10:00 10:30 11:00 11:30
    });

    it("2. plusieurs disponibilités le même jour (non chevauchantes) se cumulent", async () => {
      const doctor = await createDoctorProfile(app, { verify: true });
      const targetDate = nextDateForDayOfWeek(2); // un mardi futur

      for (const [startTime, endTime] of [
        ["09:00", "12:00"],
        ["14:00", "18:00"],
      ]) {
        const res = await app.inject({
          method: "POST",
          url: "/api/doctors/me/availability",
          headers: { authorization: `Bearer ${doctor.accessToken}` },
          payload: { type: "RECURRING", dayOfWeek: 2, startTime, endTime, slotDurationMinutes: 60, effectiveFrom: TODAY },
        });
        expect(res.statusCode).toBe(201);
      }

      const res = await app.inject({ method: "GET", url: `/api/doctors/${doctor.doctorId}/availability?from=${targetDate}&to=${targetDate}` });
      expect(res.json().slots).toHaveLength(3 + 4); // 9-12 (3) + 14-18 (4)
    });
  });

  describe("Validation", () => {
    it("3. rejette une disponibilité qui chevauche une règle existante (409)", async () => {
      const doctor = await createDoctorProfile(app);
      await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: { type: "RECURRING", dayOfWeek: 1, startTime: "09:00", endTime: "12:00", slotDurationMinutes: 30, effectiveFrom: TODAY },
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: { type: "RECURRING", dayOfWeek: 1, startTime: "11:00", endTime: "13:00", slotDurationMinutes: 30, effectiveFrom: TODAY },
      });
      expect(res.statusCode).toBe(409);
    });

    it("4. rejette une heure de fin avant l'heure de début (400)", async () => {
      const doctor = await createDoctorProfile(app);
      const res = await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: { type: "RECURRING", dayOfWeek: 1, startTime: "12:00", endTime: "09:00", slotDurationMinutes: 30, effectiveFrom: TODAY },
      });
      expect(res.statusCode).toBe(400);
    });

    it("5. rejette une durée de créneau invalide (0, négative, ou trop grande pour la plage)", async () => {
      const doctor = await createDoctorProfile(app);

      const zero = await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: { type: "RECURRING", dayOfWeek: 1, startTime: "09:00", endTime: "12:00", slotDurationMinutes: 0, effectiveFrom: TODAY },
      });
      expect(zero.statusCode).toBe(400);

      const negative = await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: { type: "RECURRING", dayOfWeek: 1, startTime: "09:00", endTime: "12:00", slotDurationMinutes: -30, effectiveFrom: TODAY },
      });
      expect(negative.statusCode).toBe(400);

      const tooLong = await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: { type: "RECURRING", dayOfWeek: 1, startTime: "09:00", endTime: "10:00", slotDurationMinutes: 90, effectiveFrom: TODAY },
      });
      expect(tooLong.statusCode).toBe(400);
    });

    it("19. rejette une règle RECURRING sans effectiveFrom (400)", async () => {
      const doctor = await createDoctorProfile(app);
      const res = await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: { type: "RECURRING", dayOfWeek: 1, startTime: "09:00", endTime: "12:00", slotDurationMinutes: 30 },
      });
      expect(res.statusCode).toBe(400);
    });

    it("20. rejette effectiveTo antérieure à effectiveFrom (400)", async () => {
      const doctor = await createDoctorProfile(app);
      const res = await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: {
          type: "RECURRING",
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "12:00",
          slotDurationMinutes: 30,
          effectiveFrom: FAR_FUTURE,
          effectiveTo: TODAY,
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("17. autorise deux règles aux mêmes horaires si leurs périodes d'application sont disjointes", async () => {
      const doctor = await createDoctorProfile(app);
      const cutoff = addCalendarDays(TODAY, 10);
      const dayAfterCutoff = addCalendarDays(cutoff, 1);

      const first = await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: {
          type: "RECURRING",
          dayOfWeek: 3,
          startTime: "09:00",
          endTime: "12:00",
          slotDurationMinutes: 30,
          effectiveFrom: TODAY,
          effectiveTo: cutoff,
        },
      });
      expect(first.statusCode).toBe(201);

      const second = await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: {
          type: "RECURRING",
          dayOfWeek: 3,
          startTime: "09:00",
          endTime: "12:00",
          slotDurationMinutes: 30,
          effectiveFrom: dayAfterCutoff,
        },
      });
      expect(second.statusCode).toBe(201);
    });

    it("18. rejette deux règles aux mêmes horaires si leurs périodes d'application se recoupent", async () => {
      const doctor = await createDoctorProfile(app);
      const first = await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: {
          type: "RECURRING",
          dayOfWeek: 4,
          startTime: "09:00",
          endTime: "12:00",
          slotDurationMinutes: 30,
          effectiveFrom: TODAY,
          effectiveTo: addCalendarDays(TODAY, 20),
        },
      });
      expect(first.statusCode).toBe(201);

      const second = await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: {
          type: "RECURRING",
          dayOfWeek: 4,
          startTime: "09:00",
          endTime: "12:00",
          slotDurationMinutes: 30,
          effectiveFrom: addCalendarDays(TODAY, 10), // chevauche [TODAY, TODAY+20]
        },
      });
      expect(second.statusCode).toBe(409);
    });
  });

  describe("Rendez-vous existants", () => {
    it("6 et 7. un créneau réservé disparaît, puis réapparaît une fois le rendez-vous annulé", async () => {
      const doctor = await createDoctorProfile(app, { verify: true });
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const targetDate = nextDateForDayOfWeek(5); // vendredi futur

      await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: { type: "RECURRING", dayOfWeek: 5, startTime: "09:00", endTime: "12:00", slotDurationMinutes: 30, effectiveFrom: TODAY },
      });

      const before = await app.inject({ method: "GET", url: `/api/doctors/${doctor.doctorId}/availability?from=${targetDate}&to=${targetDate}` });
      expect(before.json().slots).toHaveLength(6);
      const bookedSlot = before.json().slots[2]; // 10:00

      const appointment = await app.prisma.appointment.create({
        data: {
          doctorId: doctor.doctorId,
          patientId: patient.user.id,
          startAt: new Date(bookedSlot.startAt),
          endAt: new Date(bookedSlot.endAt),
          status: "CONFIRMED",
        },
      });

      const afterBooking = await app.inject({ method: "GET", url: `/api/doctors/${doctor.doctorId}/availability?from=${targetDate}&to=${targetDate}` });
      expect(afterBooking.json().slots).toHaveLength(5);
      expect(afterBooking.json().slots.map((s: { startAt: string }) => s.startAt)).not.toContain(bookedSlot.startAt);

      await app.prisma.appointment.update({ where: { id: appointment.id }, data: { status: "CANCELLED" } });

      const afterCancel = await app.inject({ method: "GET", url: `/api/doctors/${doctor.doctorId}/availability?from=${targetDate}&to=${targetDate}` });
      expect(afterCancel.json().slots).toHaveLength(6);
      expect(afterCancel.json().slots.map((s: { startAt: string }) => s.startAt)).toContain(bookedSlot.startAt);
    });

    it("un rendez-vous issu d'un ancien planning (durée différente) est retiré même sans startAt identique", async () => {
      const doctor = await createDoctorProfile(app, { verify: true });
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const targetDate = nextDateForDayOfWeek(0); // dimanche futur, dédié à ce test

      // Ancien planning : créneaux de 15 minutes.
      const ruleRes = await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: { type: "RECURRING", dayOfWeek: 0, startTime: "09:00", endTime: "12:00", slotDurationMinutes: 15, effectiveFrom: TODAY },
      });
      const ruleId = ruleRes.json().availability.id;

      const oldSlots = await app.inject({ method: "GET", url: `/api/doctors/${doctor.doctorId}/availability?from=${targetDate}&to=${targetDate}` });
      const oldSlot = oldSlots.json().slots[1]; // 09:15 -> 09:30 (décalé par rapport à une grille de 30 min alignée sur 09:00)

      await app.prisma.appointment.create({
        data: {
          doctorId: doctor.doctorId,
          patientId: patient.user.id,
          startAt: new Date(oldSlot.startAt),
          endAt: new Date(oldSlot.endAt),
          status: "CONFIRMED",
        },
      });

      // Le médecin passe à un nouveau planning : créneaux de 30 minutes,
      // toujours alignés sur 09:00 -> aucun nouveau créneau n'a exactement
      // le même startAt que le rendez-vous existant (09:15), mais le
      // créneau 09:00-09:30 le chevauche partiellement.
      const updateRes = await app.inject({
        method: "PATCH",
        url: `/api/doctors/me/availability/${ruleId}`,
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: { slotDurationMinutes: 30 },
      });
      expect(updateRes.statusCode).toBe(200);

      const newSlots = await app.inject({ method: "GET", url: `/api/doctors/${doctor.doctorId}/availability?from=${targetDate}&to=${targetDate}` });

      // Aucun nouveau créneau ne doit avoir exactement le startAt de
      // l'ancien rendez-vous (la grille a changé), ce qui aurait suffi à
      // tromper l'ancienne logique par égalité stricte de startAt.
      expect(newSlots.json().slots.map((s: { startAt: string }) => s.startAt)).not.toContain(oldSlot.startAt);

      // Le créneau 09:00-09:30 chevauche pourtant le rendez-vous 09:15-09:30
      // et ne doit donc PAS être proposé.
      const apptStart = new Date(oldSlot.startAt).getTime();
      const apptEnd = new Date(oldSlot.endAt).getTime();
      const hasOverlappingSlot = newSlots.json().slots.some((s: { startAt: string; endAt: string }) => {
        const slotStart = new Date(s.startAt).getTime();
        const slotEnd = new Date(s.endAt).getTime();
        return apptStart < slotEnd && apptEnd > slotStart;
      });
      expect(hasOverlappingSlot).toBe(false);
    });

    it("les statuts CANCELLED, COMPLETED et NO_SHOW ne bloquent jamais un créneau", async () => {
      const doctor = await createDoctorProfile(app, { verify: true });
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const targetDate = nextDateForDayOfWeek(6); // samedi futur, dédié à ce test

      await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: { type: "RECURRING", dayOfWeek: 6, startTime: "09:00", endTime: "12:00", slotDurationMinutes: 30, effectiveFrom: TODAY },
      });

      const slotsRes = await app.inject({ method: "GET", url: `/api/doctors/${doctor.doctorId}/availability?from=${targetDate}&to=${targetDate}` });
      const slots = slotsRes.json().slots as { startAt: string; endAt: string }[];
      expect(slots).toHaveLength(6);

      for (const [index, status] of (["CANCELLED", "COMPLETED", "NO_SHOW"] as const).entries()) {
        await app.prisma.appointment.create({
          data: {
            doctorId: doctor.doctorId,
            patientId: patient.user.id,
            startAt: new Date(slots[index].startAt),
            endAt: new Date(slots[index].endAt),
            status,
          },
        });
      }

      const afterRes = await app.inject({ method: "GET", url: `/api/doctors/${doctor.doctorId}/availability?from=${targetDate}&to=${targetDate}` });
      // Toujours 6 créneaux : aucun de ces statuts n'occupe un créneau.
      expect(afterRes.json().slots).toHaveLength(6);
      expect(afterRes.json().slots.map((s: { startAt: string }) => s.startAt)).toEqual(slots.map((s) => s.startAt));
    });
  });

  describe("Visibilité et statut du médecin", () => {
    it("8. exclut les créneaux déjà passés", async () => {
      const doctor = await createDoctorProfile(app, { verify: true });
      // Règle sur le jour de la semaine d'aujourd'hui, avec une heure de
      // fin dans le passé (23:59 hier n'est pas pratique ; on force via
      // une plage totalement passée sur une période antérieure à today).
      const dow = new Date(`${TODAY}T00:00:00.000Z`).getUTCDay();
      await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: {
          type: "RECURRING",
          dayOfWeek: dow,
          startTime: "00:00",
          endTime: "00:05",
          slotDurationMinutes: 5,
          effectiveFrom: addCalendarDays(TODAY, -7),
          effectiveTo: TODAY,
        },
      });

      const res = await app.inject({ method: "GET", url: `/api/doctors/${doctor.doctorId}/availability?from=${TODAY}&to=${TODAY}` });
      expect(res.json().slots).toHaveLength(0);
    });

    it("9. un médecin PENDING gère ses disponibilités mais n'est pas visible publiquement", async () => {
      const doctor = await createDoctorProfile(app); // PENDING par défaut

      const ownRes = await app.inject({
        method: "GET",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
      });
      expect(ownRes.statusCode).toBe(200);

      const publicRes = await app.inject({ method: "GET", url: `/api/doctors/${doctor.doctorId}/availability?from=${TODAY}&to=${TODAY}` });
      expect(publicRes.statusCode).toBe(404);
    });

    it("10. un médecin VERIFIED expose ses créneaux publiquement", async () => {
      const doctor = await createDoctorProfile(app, { verify: true });
      const res = await app.inject({ method: "GET", url: `/api/doctors/${doctor.doctorId}/availability?from=${TODAY}&to=${TODAY}` });
      expect(res.statusCode).toBe(200);
    });

    it("11. un médecin SUSPENDED n'est plus visible publiquement même avec des règles actives", async () => {
      const doctor = await createDoctorProfile(app, { verify: true });
      await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: { type: "RECURRING", dayOfWeek: 1, startTime: "09:00", endTime: "12:00", slotDurationMinutes: 30, effectiveFrom: TODAY },
      });

      const admin = await createAdmin(app);
      await app.inject({
        method: "PATCH",
        url: `/api/admin/doctors/${doctor.doctorId}/suspend`,
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });

      const res = await app.inject({ method: "GET", url: `/api/doctors/${doctor.doctorId}/availability?from=${TODAY}&to=${TODAY}` });
      expect(res.statusCode).toBe(404);
    });

    it("15. une période sans disponibilité renvoie une liste vide (200, pas d'erreur)", async () => {
      const doctor = await createDoctorProfile(app, { verify: true });
      const res = await app.inject({ method: "GET", url: `/api/doctors/${doctor.doctorId}/availability?from=${TODAY}&to=${TODAY}` });
      expect(res.statusCode).toBe(200);
      expect(res.json().slots).toEqual([]);
    });
  });

  describe("Permissions", () => {
    it("12. un DOCTOR ne peut pas modifier (PATCH) une disponibilité d'un autre médecin (403)", async () => {
      const doctorA = await createDoctorProfile(app);
      const doctorB = await createDoctorProfile(app);
      const ruleB = await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctorB.accessToken}` },
        payload: { type: "RECURRING", dayOfWeek: 1, startTime: "09:00", endTime: "12:00", slotDurationMinutes: 30, effectiveFrom: TODAY },
      });
      const ruleId = ruleB.json().availability.id;

      const res = await app.inject({
        method: "PATCH",
        url: `/api/doctors/me/availability/${ruleId}`,
        headers: { authorization: `Bearer ${doctorA.accessToken}` },
        payload: { startTime: "08:00" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("13. un PATIENT ne peut pas créer de disponibilité (403)", async () => {
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const res = await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${patient.accessToken}` },
        payload: { type: "RECURRING", dayOfWeek: 1, startTime: "09:00", endTime: "12:00", slotDurationMinutes: 30, effectiveFrom: TODAY },
      });
      expect(res.statusCode).toBe(403);
    });

    it("14. un médecin non propriétaire ne peut pas supprimer (DELETE) la disponibilité d'un autre (403)", async () => {
      const doctorA = await createDoctorProfile(app);
      const doctorB = await createDoctorProfile(app);
      const ruleB = await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctorB.accessToken}` },
        payload: { type: "RECURRING", dayOfWeek: 1, startTime: "09:00", endTime: "12:00", slotDurationMinutes: 30, effectiveFrom: TODAY },
      });
      const ruleId = ruleB.json().availability.id;

      const res = await app.inject({
        method: "DELETE",
        url: `/api/doctors/me/availability/${ruleId}`,
        headers: { authorization: `Bearer ${doctorA.accessToken}` },
      });
      expect(res.statusCode).toBe(403);

      const stillThere = await app.prisma.availability.findUnique({ where: { id: ruleId } });
      expect(stillThere).not.toBeNull();
    });
  });

  describe("Concurrence", () => {
    it("16. deux réservations simultanées du même créneau : une seule réussit (contrainte PostgreSQL)", async () => {
      const doctor = await createDoctorProfile(app, { verify: true });
      const patientA = await registerAndLogin(app, { role: "PATIENT" });
      const patientB = await registerAndLogin(app, { role: "PATIENT" });
      const targetDate = nextDateForDayOfWeek(6);

      await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: { type: "RECURRING", dayOfWeek: 6, startTime: "09:00", endTime: "10:00", slotDurationMinutes: 30, effectiveFrom: TODAY },
      });

      const slotsRes = await app.inject({ method: "GET", url: `/api/doctors/${doctor.doctorId}/availability?from=${targetDate}&to=${targetDate}` });
      const slot = slotsRes.json().slots[0];

      const attempt = (patientId: string) =>
        app.prisma.appointment.create({
          data: { doctorId: doctor.doctorId, patientId, startAt: new Date(slot.startAt), endAt: new Date(slot.endAt), status: "CONFIRMED" },
        });

      const results = await Promise.allSettled([attempt(patientA.user.id), attempt(patientB.user.id)]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason.code).toBe("P2002");
    });
  });

  describe("isSlotBookable()", () => {
    it("22. rejette un horaire arbitraire ne correspondant à aucun créneau publié", async () => {
      const doctor = await createDoctorProfile(app, { verify: true });
      const arbitrary = new Date(`${FAR_FUTURE}T03:00:00.000Z`);
      const bookable = await isSlotBookable(app.prisma, doctor.doctorId, arbitrary, new Date(arbitrary.getTime() + 30 * 60000));
      expect(bookable).toBe(false);
    });

    it("23. accepte un créneau réellement généré et encore libre", async () => {
      const doctor = await createDoctorProfile(app, { verify: true });
      const targetDate = nextDateForDayOfWeek(0);
      await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: { type: "RECURRING", dayOfWeek: 0, startTime: "09:00", endTime: "10:00", slotDurationMinutes: 30, effectiveFrom: TODAY },
      });

      const slotsRes = await app.inject({ method: "GET", url: `/api/doctors/${doctor.doctorId}/availability?from=${targetDate}&to=${targetDate}` });
      const slot = slotsRes.json().slots[0];

      const bookable = await isSlotBookable(app.prisma, doctor.doctorId, new Date(slot.startAt), new Date(slot.endAt));
      expect(bookable).toBe(true);
    });
  });

  describe("Isolation planning / rendez-vous existants", () => {
    it("21. modifier le planning futur ne modifie jamais un rendez-vous déjà confirmé", async () => {
      const doctor = await createDoctorProfile(app, { verify: true });
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const targetDate = nextDateForDayOfWeek(2);

      const ruleRes = await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: { type: "RECURRING", dayOfWeek: 2, startTime: "09:00", endTime: "12:00", slotDurationMinutes: 30, effectiveFrom: TODAY },
      });
      const ruleId = ruleRes.json().availability.id;

      const slotsRes = await app.inject({ method: "GET", url: `/api/doctors/${doctor.doctorId}/availability?from=${targetDate}&to=${targetDate}` });
      const bookedSlot = slotsRes.json().slots[0];

      const appointment = await app.prisma.appointment.create({
        data: {
          doctorId: doctor.doctorId,
          patientId: patient.user.id,
          startAt: new Date(bookedSlot.startAt),
          endAt: new Date(bookedSlot.endAt),
          status: "CONFIRMED",
        },
      });

      // Le médecin change complètement son planning : nouveaux horaires,
      // incompatibles avec le créneau déjà réservé.
      const updateRes = await app.inject({
        method: "PATCH",
        url: `/api/doctors/me/availability/${ruleId}`,
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: { startTime: "14:00", endTime: "17:00" },
      });
      expect(updateRes.statusCode).toBe(200);

      const untouched = await app.prisma.appointment.findUnique({ where: { id: appointment.id } });
      expect(untouched).not.toBeNull();
      expect(untouched!.status).toBe("CONFIRMED");
      expect(untouched!.startAt.toISOString()).toBe(appointment.startAt.toISOString());
      expect(untouched!.endAt.toISOString()).toBe(appointment.endAt.toISOString());
    });
  });

  describe("DATE_OVERRIDE (blocage d'une journée)", () => {
    it("bloque toute la journée indiquée, sans affecter les autres jours", async () => {
      const doctor = await createDoctorProfile(app, { verify: true });
      const dow = 3;
      const targetDate = nextDateForDayOfWeek(dow);
      const otherWeek = addCalendarDays(targetDate, 7);

      await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: { type: "RECURRING", dayOfWeek: dow, startTime: "09:00", endTime: "12:00", slotDurationMinutes: 30, effectiveFrom: TODAY },
      });

      const blockRes = await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: { type: "DATE_OVERRIDE", specificDate: targetDate },
      });
      expect(blockRes.statusCode).toBe(201);

      const blockedDay = await app.inject({ method: "GET", url: `/api/doctors/${doctor.doctorId}/availability?from=${targetDate}&to=${targetDate}` });
      expect(blockedDay.json().slots).toEqual([]);

      const normalDay = await app.inject({ method: "GET", url: `/api/doctors/${doctor.doctorId}/availability?from=${otherWeek}&to=${otherWeek}` });
      expect(normalDay.json().slots).toHaveLength(6);
    });
  });

  describe("Limites de la requête publique", () => {
    it("rejette une période supérieure à 60 jours", async () => {
      const doctor = await createDoctorProfile(app, { verify: true });
      const res = await app.inject({
        method: "GET",
        url: `/api/doctors/${doctor.doctorId}/availability?from=${TODAY}&to=${addCalendarDays(TODAY, 90)}`,
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejette from > to", async () => {
      const doctor = await createDoctorProfile(app, { verify: true });
      const res = await app.inject({
        method: "GET",
        url: `/api/doctors/${doctor.doctorId}/availability?from=${FAR_FUTURE}&to=${TODAY}`,
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
