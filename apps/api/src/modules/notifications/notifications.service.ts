import { Prisma, type Notification, type NotificationType, type PrismaClient } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import { CLINIC_TIME_ZONE } from "../../lib/timezone.js";
import type { EmailTransport } from "../../plugins/email-transport.js";

// Fenêtre de rappel : [23h, 25h] avant le rendez-vous. Suffisamment large
// pour rester robuste à la cadence du scheduler (toutes les 15 min) et à de
// courtes indisponibilités de l'API, sans jamais envoyer deux rappels pour
// le même rendez-vous (la contrainte unique de `Notification` l'empêche de
// toute façon, indépendamment de cette fenêtre).
const REMINDER_WINDOW_START_HOURS = 23;
const REMINDER_WINDOW_END_HOURS = 25;

const notificationAppointmentInclude = {
  appointment: {
    select: {
      startAt: true,
      doctor: { select: { user: { select: { firstName: true, lastName: true } } } },
      patient: { select: { firstName: true, lastName: true } },
    },
  },
} as const;

type NotificationWithAppointment = Notification & {
  appointment: {
    startAt: Date;
    doctor: { user: { firstName: string; lastName: string } };
    patient: { firstName: string; lastName: string };
  };
};

/** Vue exposée par `GET /api/notifications/me` — jamais d'email, cohérent avec les DTOs existants. */
export function toNotificationDto(notification: NotificationWithAppointment) {
  return {
    id: notification.id,
    type: notification.type,
    appointmentId: notification.appointmentId,
    appointmentStartAt: notification.appointment.startAt,
    doctorName: `${notification.appointment.doctor.user.firstName} ${notification.appointment.doctor.user.lastName}`,
    patientName: `${notification.appointment.patient.firstName} ${notification.appointment.patient.lastName}`,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };
}

export async function findNotificationById(prisma: PrismaClient, id: string) {
  return prisma.notification.findUnique({ where: { id } });
}

export async function listMyNotifications(
  prisma: PrismaClient,
  userId: string,
  params: { skip: number; take: number; unreadOnly: boolean },
) {
  // Seul le canal IN_APP est présenté à l'utilisateur : les lignes EMAIL
  // sont un journal technique d'envoi, jamais un doublon visible du même
  // événement dans la liste.
  const where = {
    userId,
    channel: "IN_APP" as const,
    ...(params.unreadOnly ? { readAt: null } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      include: notificationAppointmentInclude,
      orderBy: { createdAt: "desc" },
      skip: params.skip,
      take: params.take,
    }),
    prisma.notification.count({ where }),
  ]);

  return { items, total };
}

export async function markNotificationAsRead(prisma: PrismaClient, id: string) {
  return prisma.notification.update({
    where: { id },
    data: { readAt: new Date() },
    include: notificationAppointmentInclude,
  });
}

export async function markAllNotificationsAsRead(prisma: PrismaClient, userId: string) {
  return prisma.notification.updateMany({
    where: { userId, channel: "IN_APP", readAt: null },
    data: { readAt: new Date() },
  });
}

function formatAppointmentDateTime(startAt: Date): string {
  return formatInTimeZone(startAt, CLINIC_TIME_ZONE, "dd/MM/yyyy 'à' HH:mm");
}

type AppointmentForNotification = {
  id: string;
  startAt: Date;
  doctor: { userId: string; user: { id: string; email: string; firstName: string; lastName: string } };
  patient: { id: string; email: string; firstName: string; lastName: string };
};

/**
 * Recharge un rendez-vous avec exactement ce qu'il faut pour composer une
 * notification (emails inclus) — indépendant des DTOs publics de
 * `appointments.service.ts`, qui excluent volontairement les emails.
 */
async function loadAppointmentForNotification(prisma: PrismaClient, appointmentId: string): Promise<AppointmentForNotification | null> {
  return prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      startAt: true,
      doctor: { select: { userId: true, user: { select: { id: true, email: true, firstName: true, lastName: true } } } },
      patient: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  });
}

/**
 * Crée une notification IN_APP de façon idempotente. La contrainte unique
 * `(userId, appointmentId, type, channel)` est le mécanisme d'idempotence
 * RÉEL (appliqué par PostgreSQL) : capturer P2002 revient à dire "déjà
 * fait, rien à refaire", robuste aux appels concurrents ou aux relances.
 */
async function createInAppNotification(
  prisma: PrismaClient,
  params: { userId: string; appointmentId: string; type: NotificationType },
) {
  try {
    await prisma.notification.create({
      data: { userId: params.userId, appointmentId: params.appointmentId, type: params.type, channel: "IN_APP", status: "SENT", sentAt: new Date() },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return;
    throw error;
  }
}

/**
 * Crée puis tente d'envoyer une notification EMAIL, strictement
 * best-effort : toute erreur SMTP est capturée ICI et ne remonte jamais à
 * l'appelant (une réservation ou une annulation ne doit jamais échouer à
 * cause d'un envoi d'email). En cas d'échec, la ligne passe à `FAILED` avec
 * `errorMessage` — jamais exposée dans une réponse API.
 */
async function createAndSendEmailNotification(
  prisma: PrismaClient,
  emailTransport: EmailTransport,
  params: { userId: string; appointmentId: string; type: NotificationType; to: string; subject: string; text: string },
) {
  let notification;
  try {
    notification = await prisma.notification.create({
      data: { userId: params.userId, appointmentId: params.appointmentId, type: params.type, channel: "EMAIL", status: "PENDING" },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return; // déjà traitée : idempotence
    throw error;
  }

  try {
    await emailTransport.send({ to: params.to, subject: params.subject, text: params.text });
    await prisma.notification.update({ where: { id: notification.id }, data: { status: "SENT", sentAt: new Date() } });
  } catch (error) {
    const errorMessage = (error instanceof Error ? error.message : "Erreur inconnue lors de l'envoi de l'email.").slice(0, 500);
    await prisma.notification.update({ where: { id: notification.id }, data: { status: "FAILED", errorMessage } });
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Réservation confirmée : notifie le patient ET le médecin, sur les deux
 * canaux (IN_APP + EMAIL). Ne lève jamais — `appointments.routes.ts` peut
 * l'appeler sans se soucier d'un échec de notification.
 */
export async function notifyAppointmentBooked(prisma: PrismaClient, emailTransport: EmailTransport, appointmentId: string) {
  const appointment = await loadAppointmentForNotification(prisma, appointmentId);
  if (!appointment) return;

  const when = formatAppointmentDateTime(appointment.startAt);
  const doctorName = `${appointment.doctor.user.firstName} ${appointment.doctor.user.lastName}`;
  const patientName = `${appointment.patient.firstName} ${appointment.patient.lastName}`;

  await Promise.allSettled([
    createInAppNotification(prisma, { userId: appointment.patient.id, appointmentId, type: "APPOINTMENT_BOOKED" }),
    createInAppNotification(prisma, { userId: appointment.doctor.userId, appointmentId, type: "APPOINTMENT_BOOKED" }),
    createAndSendEmailNotification(prisma, emailTransport, {
      userId: appointment.patient.id,
      appointmentId,
      type: "APPOINTMENT_BOOKED",
      to: appointment.patient.email,
      subject: "Votre rendez-vous est confirmé",
      text: `Bonjour ${appointment.patient.firstName},\n\nVotre rendez-vous avec Dr ${doctorName} le ${when} est confirmé.\n\nMediLink AI`,
    }),
    createAndSendEmailNotification(prisma, emailTransport, {
      userId: appointment.doctor.userId,
      appointmentId,
      type: "APPOINTMENT_BOOKED",
      to: appointment.doctor.user.email,
      subject: "Nouveau rendez-vous sur votre agenda",
      text: `Bonjour Dr ${doctorName},\n\nUn nouveau rendez-vous avec ${patientName} a été confirmé pour le ${when}.\n\nMediLink AI`,
    }),
  ]);
}

/**
 * Annulation : notifie UNIQUEMENT la partie qui n'a pas agi (jamais
 * l'auteur de l'annulation, qui vient déjà de voir le résultat dans sa
 * propre interface).
 */
export async function notifyAppointmentCancelled(
  prisma: PrismaClient,
  emailTransport: EmailTransport,
  appointmentId: string,
  cancelledBy: "PATIENT" | "DOCTOR",
) {
  const appointment = await loadAppointmentForNotification(prisma, appointmentId);
  if (!appointment) return;

  const when = formatAppointmentDateTime(appointment.startAt);
  const doctorName = `${appointment.doctor.user.firstName} ${appointment.doctor.user.lastName}`;
  const patientName = `${appointment.patient.firstName} ${appointment.patient.lastName}`;

  if (cancelledBy === "PATIENT") {
    await Promise.allSettled([
      createInAppNotification(prisma, { userId: appointment.doctor.userId, appointmentId, type: "APPOINTMENT_CANCELLED" }),
      createAndSendEmailNotification(prisma, emailTransport, {
        userId: appointment.doctor.userId,
        appointmentId,
        type: "APPOINTMENT_CANCELLED",
        to: appointment.doctor.user.email,
        subject: "Rendez-vous annulé",
        text: `Bonjour Dr ${doctorName},\n\nLe rendez-vous du ${when} avec ${patientName} a été annulé par le patient.\n\nMediLink AI`,
      }),
    ]);
    return;
  }

  await Promise.allSettled([
    createInAppNotification(prisma, { userId: appointment.patient.id, appointmentId, type: "APPOINTMENT_CANCELLED" }),
    createAndSendEmailNotification(prisma, emailTransport, {
      userId: appointment.patient.id,
      appointmentId,
      type: "APPOINTMENT_CANCELLED",
      to: appointment.patient.email,
      subject: "Rendez-vous annulé",
      text: `Bonjour ${appointment.patient.firstName},\n\nVotre rendez-vous du ${when} avec Dr ${doctorName} a été annulé par le médecin.\n\nMediLink AI`,
    }),
  ]);
}

async function notifyAppointmentReminder(prisma: PrismaClient, emailTransport: EmailTransport, appointmentId: string) {
  const appointment = await loadAppointmentForNotification(prisma, appointmentId);
  if (!appointment) return;

  const when = formatAppointmentDateTime(appointment.startAt);
  const doctorName = `${appointment.doctor.user.firstName} ${appointment.doctor.user.lastName}`;

  await Promise.allSettled([
    createInAppNotification(prisma, { userId: appointment.patient.id, appointmentId, type: "APPOINTMENT_REMINDER" }),
    createAndSendEmailNotification(prisma, emailTransport, {
      userId: appointment.patient.id,
      appointmentId,
      type: "APPOINTMENT_REMINDER",
      to: appointment.patient.email,
      subject: "Rappel de rendez-vous",
      text: `Bonjour ${appointment.patient.firstName},\n\nRappel : vous avez rendez-vous avec Dr ${doctorName} le ${when}.\n\nMediLink AI`,
    }),
  ]);
}

/**
 * Balayage périodique (appelé par le scheduler in-process, ou directement
 * par les tests). Idempotent par construction : la présélection
 * `notifications: { none: ... } }` évite le travail redondant, et la
 * contrainte unique de `Notification` garantit qu'aucun doublon ne peut
 * être créé même en cas d'exécutions concurrentes ou de redémarrage de
 * l'API (l'état vit en base, jamais en mémoire du process).
 */
export async function runReminderSweep(prisma: PrismaClient, emailTransport: EmailTransport) {
  const now = Date.now();
  const windowStart = new Date(now + REMINDER_WINDOW_START_HOURS * 60 * 60 * 1000);
  const windowEnd = new Date(now + REMINDER_WINDOW_END_HOURS * 60 * 60 * 1000);

  const eligible = await prisma.appointment.findMany({
    where: {
      status: "CONFIRMED",
      startAt: { gte: windowStart, lte: windowEnd },
      notifications: { none: { type: "APPOINTMENT_REMINDER" } },
    },
    select: { id: true },
  });

  for (const { id } of eligible) {
    await notifyAppointmentReminder(prisma, emailTransport, id);
  }

  return { checked: eligible.length };
}
