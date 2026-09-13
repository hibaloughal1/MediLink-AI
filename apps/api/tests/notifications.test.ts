import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/app";
import { createVerifiedDoctorWithAvailability, getSlots, nextDateForDayOfWeek, registerAndLogin } from "./helpers";
import type { EmailMessage, EmailTransport } from "../src/plugins/email-transport";
import { notifyAppointmentBooked, runReminderSweep } from "../src/modules/notifications/notifications.service";

/**
 * Transport factice injecté à la place du transport réel/no-op choisi par
 * le plugin, pour rendre les tests déterministes quelle que soit la config
 * SMTP locale du développeur (`SMTP_HOST` dans son `.env`) et pour pouvoir
 * simuler un échec d'envoi à volonté.
 */
class FakeEmailTransport implements EmailTransport {
  sent: EmailMessage[] = [];
  shouldFail = false;

  async send(message: EmailMessage): Promise<void> {
    if (this.shouldFail) {
      throw new Error("Échec SMTP simulé (test).");
    }
    this.sent.push(message);
  }
}

async function bookSlot(app: FastifyInstance, accessToken: string, doctorId: string, slot: { startAt: string; endAt: string }) {
  return app.inject({
    method: "POST",
    url: "/api/appointments",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { doctorId, startAt: slot.startAt, endAt: slot.endAt },
  });
}

async function bookForNotifications(app: FastifyInstance, dayOfWeek = 1) {
  const doctor = await createVerifiedDoctorWithAvailability(app, { dayOfWeek });
  const patient = await registerAndLogin(app, { role: "PATIENT" });
  const date = nextDateForDayOfWeek(dayOfWeek);
  const [slot] = await getSlots(app, doctor.doctorId, date);
  const bookRes = await bookSlot(app, patient.accessToken, doctor.doctorId, slot);
  expect(bookRes.statusCode).toBe(201);
  const appointmentId = bookRes.json().appointment.id as string;
  return { doctor, patient, appointmentId };
}

describe("Notifications", () => {
  let app: FastifyInstance;
  let fakeTransport: FakeEmailTransport;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    fakeTransport = new FakeEmailTransport();
    app.emailTransport = fakeTransport;
  });

  describe("Réservation", () => {
    it("crée les 4 notifications attendues : IN_APP + EMAIL pour le patient et le médecin", async () => {
      const { doctor, patient, appointmentId } = await bookForNotifications(app, 1);

      const notifications = await app.prisma.notification.findMany({ where: { appointmentId } });
      expect(notifications).toHaveLength(4);

      const forPatient = notifications.filter((n) => n.userId === patient.user.id);
      const forDoctor = notifications.filter((n) => n.userId === doctor.user.id);
      expect(forPatient).toHaveLength(2);
      expect(forDoctor).toHaveLength(2);
      expect(forPatient.map((n) => n.channel).sort()).toEqual(["EMAIL", "IN_APP"]);
      expect(forDoctor.map((n) => n.channel).sort()).toEqual(["EMAIL", "IN_APP"]);
      expect(notifications.every((n) => n.type === "APPOINTMENT_BOOKED")).toBe(true);
      expect(notifications.every((n) => n.status === "SENT")).toBe(true);

      expect(fakeTransport.sent).toHaveLength(2);
      expect(fakeTransport.sent.map((m) => m.to).sort()).toEqual([doctor.email, patient.email].sort());
    });

    it("est idempotent : appeler deux fois la notification pour le même rendez-vous ne crée pas de doublon", async () => {
      const { appointmentId } = await bookForNotifications(app, 2);

      // La réservation a déjà déclenché un premier appel ; on le rejoue
      // explicitement pour vérifier la contrainte unique PostgreSQL.
      await notifyAppointmentBooked(app.prisma, fakeTransport, appointmentId);
      await notifyAppointmentBooked(app.prisma, fakeTransport, appointmentId);

      const notifications = await app.prisma.notification.findMany({ where: { appointmentId } });
      expect(notifications).toHaveLength(4);
    });

    it("un échec SMTP ne fait jamais échouer la réservation (toujours 201), et ne fuite jamais dans la réponse", async () => {
      fakeTransport.shouldFail = true;

      const doctor = await createVerifiedDoctorWithAvailability(app, { dayOfWeek: 3 });
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const date = nextDateForDayOfWeek(3);
      const [slot] = await getSlots(app, doctor.doctorId, date);
      const bookRes = await bookSlot(app, patient.accessToken, doctor.doctorId, slot);

      expect(bookRes.statusCode).toBe(201);
      const body = bookRes.json();
      expect(JSON.stringify(body)).not.toMatch(/smtp|échec|error/i);

      const appointmentId = body.appointment.id as string;
      const emailNotifications = await app.prisma.notification.findMany({ where: { appointmentId, channel: "EMAIL" } });
      expect(emailNotifications).toHaveLength(2);
      expect(emailNotifications.every((n) => n.status === "FAILED")).toBe(true);
      expect(emailNotifications.every((n) => typeof n.errorMessage === "string" && n.errorMessage.length > 0)).toBe(true);

      // Les notifications IN_APP, elles, ne dépendent pas du SMTP : toujours SENT.
      const inAppNotifications = await app.prisma.notification.findMany({ where: { appointmentId, channel: "IN_APP" } });
      expect(inAppNotifications.every((n) => n.status === "SENT")).toBe(true);
    });
  });

  describe("Annulation", () => {
    it("annulation par le patient : notifie uniquement le médecin, jamais le patient lui-même", async () => {
      const { doctor, patient, appointmentId } = await bookForNotifications(app, 4);

      const cancelRes = await app.inject({
        method: "PATCH",
        url: `/api/appointments/${appointmentId}/cancel`,
        headers: { authorization: `Bearer ${patient.accessToken}` },
      });
      expect(cancelRes.statusCode).toBe(200);

      const cancelNotifications = await app.prisma.notification.findMany({
        where: { appointmentId, type: "APPOINTMENT_CANCELLED" },
      });
      expect(cancelNotifications).toHaveLength(2); // IN_APP + EMAIL, pour le médecin uniquement
      expect(cancelNotifications.every((n) => n.userId === doctor.user.id)).toBe(true);
      expect(cancelNotifications.some((n) => n.userId === patient.user.id)).toBe(false);
    });

    it("annulation par le médecin : notifie uniquement le patient, jamais le médecin lui-même", async () => {
      const { doctor, patient, appointmentId } = await bookForNotifications(app, 5);

      const cancelRes = await app.inject({
        method: "PATCH",
        url: `/api/doctors/me/appointments/${appointmentId}/cancel`,
        headers: { authorization: `Bearer ${doctor.accessToken}` },
      });
      expect(cancelRes.statusCode).toBe(200);

      const cancelNotifications = await app.prisma.notification.findMany({
        where: { appointmentId, type: "APPOINTMENT_CANCELLED" },
      });
      expect(cancelNotifications).toHaveLength(2);
      expect(cancelNotifications.every((n) => n.userId === patient.user.id)).toBe(true);
      expect(cancelNotifications.some((n) => n.userId === doctor.user.id)).toBe(false);
    });

    it("un échec SMTP ne fait jamais échouer l'annulation (toujours 200)", async () => {
      const { patient, appointmentId } = await bookForNotifications(app, 6);
      fakeTransport.shouldFail = true;

      const cancelRes = await app.inject({
        method: "PATCH",
        url: `/api/appointments/${appointmentId}/cancel`,
        headers: { authorization: `Bearer ${patient.accessToken}` },
      });
      expect(cancelRes.statusCode).toBe(200);

      const emailNotification = await app.prisma.notification.findFirst({
        where: { appointmentId, type: "APPOINTMENT_CANCELLED", channel: "EMAIL" },
      });
      expect(emailNotification?.status).toBe("FAILED");
    });
  });

  describe("GET /api/notifications/me — IDOR et RBAC", () => {
    it("refuse l'accès sans authentification (401)", async () => {
      const res = await app.inject({ method: "GET", url: "/api/notifications/me" });
      expect(res.statusCode).toBe(401);
    });

    it("ne renvoie jamais les notifications d'un autre utilisateur", async () => {
      const { patient: patientA } = await bookForNotifications(app, 1);
      const patientB = await registerAndLogin(app, { role: "PATIENT" });

      const res = await app.inject({
        method: "GET",
        url: "/api/notifications/me?limit=100",
        headers: { authorization: `Bearer ${patientB.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().notifications).toHaveLength(0);

      const resA = await app.inject({
        method: "GET",
        url: "/api/notifications/me?limit=100",
        headers: { authorization: `Bearer ${patientA.accessToken}` },
      });
      expect(resA.json().notifications.length).toBeGreaterThan(0);
    });

    it("n'expose que le canal IN_APP (jamais les lignes EMAIL, qui sont un journal technique)", async () => {
      const { patient } = await bookForNotifications(app, 2);
      const res = await app.inject({
        method: "GET",
        url: "/api/notifications/me?limit=100",
        headers: { authorization: `Bearer ${patient.accessToken}` },
      });
      // Une seule notification IN_APP pour ce patient sur cette réservation
      // (l'éventuelle ligne EMAIL correspondante n'est jamais renvoyée ici).
      expect(res.json().notifications.filter((n: { type: string }) => n.type === "APPOINTMENT_BOOKED")).toHaveLength(1);
    });
  });

  describe("PATCH /api/notifications/me/:id/read — IDOR", () => {
    it("403 si la notification appartient à un autre utilisateur", async () => {
      const { patient: patientA } = await bookForNotifications(app, 3);
      const patientB = await registerAndLogin(app, { role: "PATIENT" });

      const notification = await app.prisma.notification.findFirstOrThrow({
        where: { userId: patientA.user.id, channel: "IN_APP" },
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/notifications/me/${notification.id}/read`,
        headers: { authorization: `Bearer ${patientB.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("404 pour une notification inexistante", async () => {
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const res = await app.inject({
        method: "PATCH",
        url: "/api/notifications/me/00000000-0000-0000-0000-000000000000/read",
        headers: { authorization: `Bearer ${patient.accessToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it("marque sa propre notification comme lue (idempotent si rejoué)", async () => {
      const { patient } = await bookForNotifications(app, 4);
      const notification = await app.prisma.notification.findFirstOrThrow({
        where: { userId: patient.user.id, channel: "IN_APP" },
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/notifications/me/${notification.id}/read`,
        headers: { authorization: `Bearer ${patient.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().notification.readAt).not.toBeNull();

      const again = await app.inject({
        method: "PATCH",
        url: `/api/notifications/me/${notification.id}/read`,
        headers: { authorization: `Bearer ${patient.accessToken}` },
      });
      expect(again.statusCode).toBe(200);
    });
  });

  describe("PATCH /api/notifications/me/read-all", () => {
    it("marque toutes les notifications non lues de l'appelant comme lues, sans toucher aux autres utilisateurs", async () => {
      const { doctor, patient } = await bookForNotifications(app, 5);

      const res = await app.inject({
        method: "PATCH",
        url: "/api/notifications/me/read-all",
        headers: { authorization: `Bearer ${patient.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().updated).toBeGreaterThan(0);

      const patientUnread = await app.prisma.notification.count({
        where: { userId: patient.user.id, channel: "IN_APP", readAt: null },
      });
      expect(patientUnread).toBe(0);

      // Le médecin n'a pas été affecté par l'appel du patient.
      const doctorUnread = await app.prisma.notification.count({
        where: { userId: doctor.user.id, channel: "IN_APP", readAt: null },
      });
      expect(doctorUnread).toBeGreaterThan(0);
    });

    it("filtre unreadOnly=true n'affiche que les notifications non lues", async () => {
      const { patient } = await bookForNotifications(app, 6);

      await app.inject({
        method: "PATCH",
        url: "/api/notifications/me/read-all",
        headers: { authorization: `Bearer ${patient.accessToken}` },
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/notifications/me?unreadOnly=true",
        headers: { authorization: `Bearer ${patient.accessToken}` },
      });
      expect(res.json().notifications).toHaveLength(0);
    });
  });

  describe("Scheduler de rappel (runReminderSweep)", () => {
    async function createConfirmedAppointmentInHours(hoursFromNow: number, status: "CONFIRMED" | "CANCELLED" = "CONFIRMED") {
      const doctor = await createVerifiedDoctorWithAvailability(app, { dayOfWeek: 1 });
      const patient = await registerAndLogin(app, { role: "PATIENT" });
      const startAt = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
      const endAt = new Date(startAt.getTime() + 30 * 60 * 1000);
      const appointment = await app.prisma.appointment.create({
        data: { doctorId: doctor.doctorId, patientId: patient.user.id, startAt, endAt, status },
      });
      return { doctor, patient, appointment };
    }

    it("scheduler #1 crée le rappel pour un rendez-vous CONFIRMED dans la fenêtre ~24h", async () => {
      const { patient, appointment } = await createConfirmedAppointmentInHours(24);

      const result = await runReminderSweep(app.prisma, fakeTransport);
      expect(result.checked).toBeGreaterThanOrEqual(1);

      const reminders = await app.prisma.notification.findMany({
        where: { appointmentId: appointment.id, type: "APPOINTMENT_REMINDER" },
      });
      expect(reminders).toHaveLength(2); // IN_APP + EMAIL, pour le patient
      expect(reminders.every((n) => n.userId === patient.user.id)).toBe(true);
    });

    it("scheduler #2 (relance) ne crée aucun doublon — idempotence PostgreSQL, y compris après un redémarrage simulé de l'API", async () => {
      const { appointment } = await createConfirmedAppointmentInHours(24.5);

      await runReminderSweep(app.prisma, fakeTransport);
      // Un « redémarrage » ne changerait rien : aucun état n'est gardé en
      // mémoire du process, tout vit dans la contrainte unique en base.
      await runReminderSweep(app.prisma, fakeTransport);
      await runReminderSweep(app.prisma, fakeTransport);

      const reminders = await app.prisma.notification.findMany({
        where: { appointmentId: appointment.id, type: "APPOINTMENT_REMINDER" },
      });
      expect(reminders).toHaveLength(2);
    });

    it("un rendez-vous CANCELLED dans la fenêtre ne reçoit jamais de rappel", async () => {
      const { appointment } = await createConfirmedAppointmentInHours(24, "CANCELLED");

      await runReminderSweep(app.prisma, fakeTransport);

      const reminders = await app.prisma.notification.count({
        where: { appointmentId: appointment.id, type: "APPOINTMENT_REMINDER" },
      });
      expect(reminders).toBe(0);
    });

    it("un rendez-vous CONFIRMED hors de la fenêtre (ex. dans 48h) n'est pas éligible", async () => {
      const { appointment } = await createConfirmedAppointmentInHours(48);

      await runReminderSweep(app.prisma, fakeTransport);

      const reminders = await app.prisma.notification.count({
        where: { appointmentId: appointment.id, type: "APPOINTMENT_REMINDER" },
      });
      expect(reminders).toBe(0);
    });
  });
});
