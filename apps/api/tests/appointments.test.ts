import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/app";
import {
  createAdmin,
  createDoctorProfile,
  createVerifiedDoctorWithAvailability,
  getSlots,
  nextDateForDayOfWeek,
  registerAndLogin,
} from "./helpers";
import { addCalendarDays, localToUtc } from "../src/lib/timezone";

const TODAY = new Date().toISOString().slice(0, 10);

async function bookSlot(app: FastifyInstance, accessToken: string, doctorId: string, slot: { startAt: string; endAt: string }) {
  return app.inject({
    method: "POST",
    url: "/api/appointments",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { doctorId, startAt: slot.startAt, endAt: slot.endAt },
  });
}

describe("Appointments", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Création — cas nominal", () => {
    it("réserve un créneau réellement disponible (201, CONFIRMED)", async () => {
      const doctor = await createVerifiedDoctorWithAvailability(app, { dayOfWeek: 1 });
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const targetDate = nextDateForDayOfWeek(1);
      const [slot] = await getSlots(app, doctor.doctorId, targetDate);

      const res = await bookSlot(app, patient.accessToken, doctor.doctorId, slot);
      expect(res.statusCode).toBe(201);
      const body = res.json().appointment;
      expect(body.status).toBe("CONFIRMED");
      expect(body.startAt).toBe(slot.startAt);
      expect(body.doctor.id).toBe(doctor.doctorId);
    });

    it("ignore tout patientId envoyé dans le corps : le rendez-vous appartient toujours à l'appelant", async () => {
      const doctor = await createVerifiedDoctorWithAvailability(app, { dayOfWeek: 2 });
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const otherPatient = await registerAndLogin(app, { role: "PATIENT" });
      const targetDate = nextDateForDayOfWeek(2);
      const [slot] = await getSlots(app, doctor.doctorId, targetDate);

      const res = await app.inject({
        method: "POST",
        url: "/api/appointments",
        headers: { authorization: `Bearer ${patient.accessToken}` },
        payload: { doctorId: doctor.doctorId, startAt: slot.startAt, endAt: slot.endAt, patientId: otherPatient.user.id },
      });
      expect(res.statusCode).toBe(201);

      const mine = await app.inject({ method: "GET", url: "/api/appointments/me", headers: { authorization: `Bearer ${patient.accessToken}` } });
      expect(mine.json().appointments).toHaveLength(1);

      const notMine = await app.inject({ method: "GET", url: "/api/appointments/me", headers: { authorization: `Bearer ${otherPatient.accessToken}` } });
      expect(notMine.json().appointments).toHaveLength(0);
    });
  });

  describe("Validation métier", () => {
    it("refuse un médecin inexistant (404)", async () => {
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const res = await bookSlot(app, patient.accessToken, "00000000-0000-0000-0000-000000000000", {
        startAt: new Date(Date.now() + 86400000).toISOString(),
        endAt: new Date(Date.now() + 86400000 + 1800000).toISOString(),
      });
      expect(res.statusCode).toBe(404);
    });

    it("refuse un créneau chez un médecin non VERIFIED (409)", async () => {
      const doctor = await createDoctorProfile(app); // PENDING
      const dayOfWeek = 3;
      await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: { type: "RECURRING", dayOfWeek, startTime: "09:00", endTime: "12:00", slotDurationMinutes: 30, effectiveFrom: TODAY },
      });
      const targetDate = nextDateForDayOfWeek(dayOfWeek);
      const startAt = localToUtc(targetDate, "09:00").toISOString();
      const endAt = localToUtc(targetDate, "09:30").toISOString();

      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const res = await bookSlot(app, patient.accessToken, doctor.doctorId, { startAt, endAt });
      expect(res.statusCode).toBe(409);
    });

    it("refuse un startAt/endAt arbitraire ne correspondant à aucun créneau publié (409)", async () => {
      const doctor = await createVerifiedDoctorWithAvailability(app, { dayOfWeek: 4, startTime: "09:00", endTime: "12:00" });
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const targetDate = nextDateForDayOfWeek(4);
      const startAt = localToUtc(targetDate, "23:00").toISOString(); // hors plage 09:00-12:00
      const endAt = localToUtc(targetDate, "23:30").toISOString();

      const res = await bookSlot(app, patient.accessToken, doctor.doctorId, { startAt, endAt });
      expect(res.statusCode).toBe(409);
    });

    it("refuse un créneau déjà réservé (409)", async () => {
      const doctor = await createVerifiedDoctorWithAvailability(app, { dayOfWeek: 5 });
      const patientA = await registerAndLogin(app, { role: "PATIENT" });
      const patientB = await registerAndLogin(app, { role: "PATIENT" });
      const targetDate = nextDateForDayOfWeek(5);
      const [slot] = await getSlots(app, doctor.doctorId, targetDate);

      const first = await bookSlot(app, patientA.accessToken, doctor.doctorId, slot);
      expect(first.statusCode).toBe(201);

      const second = await bookSlot(app, patientB.accessToken, doctor.doctorId, slot);
      expect(second.statusCode).toBe(409);
    });

    it("refuse un créneau déjà passé (409)", async () => {
      const doctor = await createDoctorProfile(app, { verify: true });
      const dayOfWeek = 6;
      await app.inject({
        method: "POST",
        url: "/api/doctors/me/availability",
        headers: { authorization: `Bearer ${doctor.accessToken}` },
        payload: {
          type: "RECURRING",
          dayOfWeek,
          startTime: "09:00",
          endTime: "12:00",
          slotDurationMinutes: 30,
          effectiveFrom: addCalendarDays(TODAY, -60),
        },
      });

      // Dernière occurrence passée de ce jour de semaine.
      let pastDate = addCalendarDays(TODAY, -1);
      while (new Date(`${pastDate}T00:00:00.000Z`).getUTCDay() !== dayOfWeek) {
        pastDate = addCalendarDays(pastDate, -1);
      }
      const startAt = localToUtc(pastDate, "09:00").toISOString();
      const endAt = localToUtc(pastDate, "09:30").toISOString();

      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const res = await bookSlot(app, patient.accessToken, doctor.doctorId, { startAt, endAt });
      expect(res.statusCode).toBe(409);
    });
  });

  describe("Concurrence réelle (HTTP)", () => {
    it("deux réservations HTTP simultanées du même créneau : une seule obtient 201, l'autre 409", async () => {
      const doctor = await createVerifiedDoctorWithAvailability(app, { dayOfWeek: 0 });
      const patientA = await registerAndLogin(app, { role: "PATIENT" });
      const patientB = await registerAndLogin(app, { role: "PATIENT" });
      const targetDate = nextDateForDayOfWeek(0);
      const [slot] = await getSlots(app, doctor.doctorId, targetDate);

      const [resA, resB] = await Promise.all([
        bookSlot(app, patientA.accessToken, doctor.doctorId, slot),
        bookSlot(app, patientB.accessToken, doctor.doctorId, slot),
      ]);

      const statuses = [resA.statusCode, resB.statusCode].sort();
      expect(statuses).toEqual([201, 409]);
    });
  });

  describe("Annulation", () => {
    it("le patient propriétaire peut annuler : statut CANCELLED, créneau à nouveau disponible", async () => {
      const doctor = await createVerifiedDoctorWithAvailability(app, { dayOfWeek: 1, startTime: "13:00", endTime: "15:00" });
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const targetDate = nextDateForDayOfWeek(1);
      const [slot] = await getSlots(app, doctor.doctorId, targetDate);

      const bookRes = await bookSlot(app, patient.accessToken, doctor.doctorId, slot);
      const appointmentId = bookRes.json().appointment.id;

      const cancelRes = await app.inject({
        method: "PATCH",
        url: `/api/appointments/${appointmentId}/cancel`,
        headers: { authorization: `Bearer ${patient.accessToken}` },
      });
      expect(cancelRes.statusCode).toBe(200);
      expect(cancelRes.json().appointment.status).toBe("CANCELLED");

      const slotsAfter = await getSlots(app, doctor.doctorId, targetDate);
      expect(slotsAfter.map((s) => s.startAt)).toContain(slot.startAt);
    });

    it("un autre patient ne peut pas annuler (403)", async () => {
      const doctor = await createVerifiedDoctorWithAvailability(app, { dayOfWeek: 2, startTime: "13:00", endTime: "15:00" });
      const owner = await registerAndLogin(app, { role: "PATIENT" });
      const intruder = await registerAndLogin(app, { role: "PATIENT" });
      const targetDate = nextDateForDayOfWeek(2);
      const [slot] = await getSlots(app, doctor.doctorId, targetDate);

      const bookRes = await bookSlot(app, owner.accessToken, doctor.doctorId, slot);
      const appointmentId = bookRes.json().appointment.id;

      const res = await app.inject({
        method: "PATCH",
        url: `/api/appointments/${appointmentId}/cancel`,
        headers: { authorization: `Bearer ${intruder.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("le médecin concerné peut annuler le rendez-vous d'un patient", async () => {
      const doctor = await createVerifiedDoctorWithAvailability(app, { dayOfWeek: 3, startTime: "13:00", endTime: "15:00" });
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const targetDate = nextDateForDayOfWeek(3);
      const [slot] = await getSlots(app, doctor.doctorId, targetDate);

      const bookRes = await bookSlot(app, patient.accessToken, doctor.doctorId, slot);
      const appointmentId = bookRes.json().appointment.id;

      const res = await app.inject({
        method: "PATCH",
        url: `/api/doctors/me/appointments/${appointmentId}/cancel`,
        headers: { authorization: `Bearer ${doctor.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().appointment.status).toBe("CANCELLED");
    });

    it("un médecin non concerné ne peut pas annuler (403)", async () => {
      const doctor = await createVerifiedDoctorWithAvailability(app, { dayOfWeek: 4, startTime: "13:00", endTime: "15:00" });
      const otherDoctor = await createDoctorProfile(app, { verify: true });
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const targetDate = nextDateForDayOfWeek(4);
      const [slot] = await getSlots(app, doctor.doctorId, targetDate);

      const bookRes = await bookSlot(app, patient.accessToken, doctor.doctorId, slot);
      const appointmentId = bookRes.json().appointment.id;

      const res = await app.inject({
        method: "PATCH",
        url: `/api/doctors/me/appointments/${appointmentId}/cancel`,
        headers: { authorization: `Bearer ${otherDoctor.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("refuse d'annuler un rendez-vous déjà annulé (409)", async () => {
      const doctor = await createVerifiedDoctorWithAvailability(app, { dayOfWeek: 5, startTime: "13:00", endTime: "15:00" });
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const targetDate = nextDateForDayOfWeek(5);
      const [slot] = await getSlots(app, doctor.doctorId, targetDate);

      const bookRes = await bookSlot(app, patient.accessToken, doctor.doctorId, slot);
      const appointmentId = bookRes.json().appointment.id;

      await app.inject({ method: "PATCH", url: `/api/appointments/${appointmentId}/cancel`, headers: { authorization: `Bearer ${patient.accessToken}` } });
      const second = await app.inject({ method: "PATCH", url: `/api/appointments/${appointmentId}/cancel`, headers: { authorization: `Bearer ${patient.accessToken}` } });
      expect(second.statusCode).toBe(409);
    });

    it("refuse d'annuler un rendez-vous déjà passé (409)", async () => {
      const doctor = await createVerifiedDoctorWithAvailability(app, { dayOfWeek: 6, startTime: "13:00", endTime: "15:00" });
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const targetDate = nextDateForDayOfWeek(6);
      const [slot] = await getSlots(app, doctor.doctorId, targetDate);

      const bookRes = await bookSlot(app, patient.accessToken, doctor.doctorId, slot);
      const appointmentId = bookRes.json().appointment.id;

      // Fait passer le rendez-vous dans le passé directement en base
      // (simule l'écoulement du temps, sans dépendre d'une vraie attente).
      await app.prisma.appointment.update({
        where: { id: appointmentId },
        data: { startAt: new Date(Date.now() - 3600_000), endAt: new Date(Date.now() - 1800_000) },
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/appointments/${appointmentId}/cancel`,
        headers: { authorization: `Bearer ${patient.accessToken}` },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe("Agenda médecin", () => {
    it("un médecin ne voit que ses propres rendez-vous", async () => {
      const doctorA = await createVerifiedDoctorWithAvailability(app, { dayOfWeek: 1, startTime: "15:00", endTime: "17:00" });
      const doctorB = await createVerifiedDoctorWithAvailability(app, { dayOfWeek: 1, startTime: "15:00", endTime: "17:00" });
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const targetDate = nextDateForDayOfWeek(1);

      const [slotA] = await getSlots(app, doctorA.doctorId, targetDate);
      await bookSlot(app, patient.accessToken, doctorA.doctorId, slotA);

      const agendaA = await app.inject({ method: "GET", url: "/api/doctors/me/appointments", headers: { authorization: `Bearer ${doctorA.accessToken}` } });
      expect(agendaA.json().appointments).toHaveLength(1);

      const agendaB = await app.inject({ method: "GET", url: "/api/doctors/me/appointments", headers: { authorization: `Bearer ${doctorB.accessToken}` } });
      expect(agendaB.json().appointments).toHaveLength(0);
    });
  });

  describe("RBAC", () => {
    it("un PATIENT ne peut pas accéder aux routes médecin (403)", async () => {
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const res = await app.inject({ method: "GET", url: "/api/doctors/me/appointments", headers: { authorization: `Bearer ${patient.accessToken}` } });
      expect(res.statusCode).toBe(403);
    });

    it("un DOCTOR ne peut pas réserver de rendez-vous (403)", async () => {
      const doctor = await createVerifiedDoctorWithAvailability(app, { dayOfWeek: 2 });
      const targetDate = nextDateForDayOfWeek(2);
      const [slot] = await getSlots(app, doctor.doctorId, targetDate);

      const res = await bookSlot(app, doctor.accessToken, doctor.doctorId, slot);
      expect(res.statusCode).toBe(403);
    });

    it("un ADMIN voit tous les rendez-vous", async () => {
      const doctor = await createVerifiedDoctorWithAvailability(app, { dayOfWeek: 3, startTime: "16:00", endTime: "18:00" });
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const targetDate = nextDateForDayOfWeek(3);
      const [slot] = await getSlots(app, doctor.doctorId, targetDate);
      const bookRes = await bookSlot(app, patient.accessToken, doctor.doctorId, slot);
      expect(bookRes.statusCode).toBe(201);

      const admin = await createAdmin(app);
      // limit élevé : la base de test accumule les rendez-vous créés par
      // l'ensemble de la suite, la pagination par défaut (20) pourrait
      // sinon ne pas inclure celui-ci selon l'ordre par startAt desc.
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/appointments?limit=100",
        headers: { authorization: `Bearer ${admin.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().appointments.some((a: { id: string }) => a.id === bookRes.json().appointment.id)).toBe(true);
    });

    it("PATIENT et DOCTOR n'ont pas accès à la route admin (403)", async () => {
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const doctor = await registerAndLogin(app, { role: "DOCTOR" });

      const resPatient = await app.inject({ method: "GET", url: "/api/admin/appointments", headers: { authorization: `Bearer ${patient.accessToken}` } });
      expect(resPatient.statusCode).toBe(403);

      const resDoctor = await app.inject({ method: "GET", url: "/api/admin/appointments", headers: { authorization: `Bearer ${doctor.accessToken}` } });
      expect(resDoctor.statusCode).toBe(403);
    });
  });
});
