import { Prisma, type Appointment, type PrismaClient } from "@prisma/client";
import { isSlotBookable } from "../availability/availability.service.js";

export class SlotNotBookableError extends Error {
  constructor() {
    super("Ce créneau ne correspond à aucune disponibilité publiée par ce médecin.");
    this.name = "SlotNotBookableError";
  }
}

export class SlotAlreadyBookedError extends Error {
  constructor() {
    super("Ce créneau vient d'être réservé, veuillez en choisir un autre.");
    this.name = "SlotAlreadyBookedError";
  }
}

export class AppointmentAlreadyFinalizedError extends Error {
  constructor() {
    super("Ce rendez-vous ne peut plus être annulé (déjà annulé, terminé ou passé).");
    this.name = "AppointmentAlreadyFinalizedError";
  }
}

type AppointmentWithDoctor = Appointment & {
  doctor: {
    id: string;
    address: string | null;
    user: { firstName: string; lastName: string };
    city: { id: string; name: string } | null;
    specialties: { specialty: { id: string; name: string } }[];
  };
};

type AppointmentWithPatient = Appointment & {
  patient: { firstName: string; lastName: string; phone: string | null };
};

const doctorSummaryInclude = {
  user: { select: { firstName: true, lastName: true } },
  city: { select: { id: true, name: true } },
  specialties: { include: { specialty: { select: { id: true, name: true } } } },
} as const;

const patientSummarySelect = { firstName: true, lastName: true, phone: true } as const;

/** Vue patient : son rendez-vous + les infos publiques du médecin (jamais son email). */
export function toPatientAppointmentDto(appointment: AppointmentWithDoctor) {
  return {
    id: appointment.id,
    startAt: appointment.startAt,
    endAt: appointment.endAt,
    status: appointment.status,
    doctor: {
      id: appointment.doctor.id,
      firstName: appointment.doctor.user.firstName,
      lastName: appointment.doctor.user.lastName,
      address: appointment.doctor.address,
      city: appointment.doctor.city,
      specialties: appointment.doctor.specialties.map((ds) => ds.specialty),
    },
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt,
  };
}

/** Vue médecin : le rendez-vous + de quoi identifier/contacter le patient (pas son email). */
export function toDoctorAppointmentDto(appointment: AppointmentWithPatient) {
  return {
    id: appointment.id,
    startAt: appointment.startAt,
    endAt: appointment.endAt,
    status: appointment.status,
    patient: {
      firstName: appointment.patient.firstName,
      lastName: appointment.patient.lastName,
      phone: appointment.patient.phone,
    },
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt,
  };
}

/** Vue admin : consultation seule, identifie les deux parties. */
export function toAdminAppointmentDto(appointment: AppointmentWithDoctor & AppointmentWithPatient) {
  return {
    id: appointment.id,
    startAt: appointment.startAt,
    endAt: appointment.endAt,
    status: appointment.status,
    doctorId: appointment.doctorId,
    doctorName: `${appointment.doctor.user.firstName} ${appointment.doctor.user.lastName}`,
    patientId: appointment.patientId,
    patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt,
  };
}

/**
 * Crée un rendez-vous CONFIRMED pour un créneau réellement disponible.
 *
 * Deux protections indépendantes, toutes deux nécessaires :
 *  1. `isSlotBookable` (métier) : le créneau doit correspondre exactement
 *     à une disponibilité publiée, non déjà occupée, pour un médecin
 *     VERIFIED + actif — élimine toute réservation hors planning.
 *  2. L'index unique partiel PostgreSQL `appointments_doctor_slot_unique`
 *     (doctorId, startAt) WHERE status IN ('PENDING','CONFIRMED') —
 *     élimine les doubles réservations concurrentes du même créneau réel.
 *     Interceptée ici localement (P2002), jamais globalement, pour ne pas
 *     confondre une violation de cette contrainte avec une autre (ex.
 *     email dupliqué).
 */
export async function createAppointment(
  prisma: PrismaClient,
  params: { doctorId: string; patientId: string; startAt: Date; endAt: Date },
) {
  const bookable = await isSlotBookable(prisma, params.doctorId, params.startAt, params.endAt);
  if (!bookable) {
    throw new SlotNotBookableError();
  }

  try {
    return await prisma.appointment.create({
      data: {
        doctorId: params.doctorId,
        patientId: params.patientId,
        startAt: params.startAt,
        endAt: params.endAt,
        status: "CONFIRMED",
      },
      include: { doctor: { include: doctorSummaryInclude }, patient: { select: patientSummarySelect } },
    });
  } catch (error) {
    // P2002 sur une création d'Appointment ne peut réalistement provenir
    // que de l'index unique partiel anti-double-réservation : `id` est un
    // UUID généré côté application (collision non réaliste) et c'est la
    // seule contrainte unique du modèle. `meta.target` liste les colonnes
    // (["doctorId","startAt"]) et non le nom de l'index — on se base donc
    // uniquement sur le code d'erreur, pas sur le contenu de `meta`.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new SlotAlreadyBookedError();
    }
    throw error;
  }
}

export async function findAppointmentById(prisma: PrismaClient, id: string) {
  return prisma.appointment.findUnique({
    where: { id },
    include: { doctor: { include: doctorSummaryInclude }, patient: { select: patientSummarySelect } },
  });
}

export async function listPatientAppointments(
  prisma: PrismaClient,
  patientId: string,
  params: { skip: number; take: number },
) {
  const [items, total] = await Promise.all([
    prisma.appointment.findMany({
      where: { patientId },
      include: { doctor: { include: doctorSummaryInclude } },
      orderBy: { startAt: "desc" },
      skip: params.skip,
      take: params.take,
    }),
    prisma.appointment.count({ where: { patientId } }),
  ]);
  return { items, total };
}

export async function listDoctorAppointments(
  prisma: PrismaClient,
  doctorId: string,
  params: { skip: number; take: number },
) {
  const [items, total] = await Promise.all([
    prisma.appointment.findMany({
      where: { doctorId },
      include: { patient: { select: patientSummarySelect } },
      orderBy: { startAt: "desc" },
      skip: params.skip,
      take: params.take,
    }),
    prisma.appointment.count({ where: { doctorId } }),
  ]);
  return { items, total };
}

export async function listAllAppointmentsForAdmin(prisma: PrismaClient, params: { skip: number; take: number }) {
  const [items, total] = await Promise.all([
    prisma.appointment.findMany({
      include: { doctor: { include: doctorSummaryInclude }, patient: { select: patientSummarySelect } },
      orderBy: { startAt: "desc" },
      skip: params.skip,
      take: params.take,
    }),
    prisma.appointment.count(),
  ]);
  return { items, total };
}

const CANCELLABLE_STATUSES = ["PENDING", "CONFIRMED"] as const;

/**
 * Annule un rendez-vous : passe uniquement son statut à CANCELLED, ne
 * supprime jamais la ligne (historique conservé). Refuse d'annuler un
 * rendez-vous déjà finalisé (CANCELLED/COMPLETED/NO_SHOW) ou déjà passé.
 */
export async function cancelAppointment(prisma: PrismaClient, appointment: Appointment) {
  const isCancellable =
    (CANCELLABLE_STATUSES as readonly string[]).includes(appointment.status) && appointment.startAt.getTime() > Date.now();

  if (!isCancellable) {
    throw new AppointmentAlreadyFinalizedError();
  }

  return prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: "CANCELLED" },
    include: { doctor: { include: doctorSummaryInclude }, patient: { select: patientSummarySelect } },
  });
}
