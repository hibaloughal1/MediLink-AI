import type { Availability, PrismaClient } from "@prisma/client";
import {
  addCalendarDays,
  calendarDaysBetween,
  clockTimeToMinutes,
  localToUtc,
  minutesToClockTime,
  utcToCalendarDate,
  type CalendarDate,
} from "../../lib/timezone.js";
import type {
  CreateAvailabilityInput,
  UpdateDateOverrideAvailabilityInput,
  UpdateRecurringAvailabilityInput,
} from "./availability.schemas.js";

export class AvailabilityOverlapError extends Error {
  constructor() {
    super("Cette plage horaire chevauche une disponibilité existante sur la même période.");
    this.name = "AvailabilityOverlapError";
  }
}

export class DateOverrideAlreadyExistsError extends Error {
  constructor() {
    super("Une règle de blocage existe déjà pour cette date.");
    this.name = "DateOverrideAlreadyExistsError";
  }
}

/** Erreur de cohérence (horaires, durée, fenêtre de dates) détectée après
 * fusion d'une mise à jour partielle avec la règle existante — distincte
 * d'un chevauchement avec une autre règle. */
export class AvailabilityValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AvailabilityValidationError";
  }
}

const ACTIVE_APPOINTMENT_STATUSES = ["PENDING", "CONFIRMED"] as const;

function toDateOnly(date: CalendarDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function dbDateToCalendarDate(date: Date): CalendarDate {
  // Colonne @db.Date : Prisma la restitue en Date UTC à minuit ; ses
  // composantes UTC correspondent directement à la date calendaire stockée
  // (aucune conversion de fuseau horaire n'est nécessaire ici, contrairement
  // à `utcToCalendarDate`, réservée aux instants concrets type Appointment).
  return date.toISOString().slice(0, 10);
}

export function toAvailabilityDto(row: Availability) {
  return {
    id: row.id,
    doctorId: row.doctorId,
    type: row.type,
    dayOfWeek: row.dayOfWeek,
    startTime: row.startTime,
    endTime: row.endTime,
    slotDurationMinutes: row.slotDurationMinutes,
    effectiveFrom: row.effectiveFrom ? dbDateToCalendarDate(row.effectiveFrom) : null,
    effectiveTo: row.effectiveTo ? dbDateToCalendarDate(row.effectiveTo) : null,
    specificDate: row.specificDate ? dbDateToCalendarDate(row.specificDate) : null,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listDoctorAvailability(prisma: PrismaClient, doctorId: string) {
  return prisma.availability.findMany({
    where: { doctorId },
    orderBy: [{ type: "asc" }, { dayOfWeek: "asc" }, { specificDate: "asc" }],
  });
}

export async function findAvailabilityById(prisma: PrismaClient, id: string) {
  return prisma.availability.findUnique({ where: { id } });
}

/**
 * Vérifie qu'une règle RECURRING candidate ne chevauche aucune règle
 * active existante du même médecin/jour : à la fois sur l'horaire ET sur
 * la fenêtre d'application (deux règles disjointes dans le temps, même à
 * horaires identiques, ne sont pas en conflit — c'est ce qui permet de
 * programmer un changement de planning à l'avance).
 */
async function assertNoRecurringOverlap(
  prisma: PrismaClient,
  doctorId: string,
  candidate: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    effectiveFrom: CalendarDate;
    effectiveTo: CalendarDate | null;
  },
  excludeId?: string,
) {
  const siblings = await prisma.availability.findMany({
    where: {
      doctorId,
      type: "RECURRING",
      dayOfWeek: candidate.dayOfWeek,
      isActive: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });

  const candStart = clockTimeToMinutes(candidate.startTime);
  const candEnd = clockTimeToMinutes(candidate.endTime);
  const candFrom = candidate.effectiveFrom;
  const candTo = candidate.effectiveTo ?? "9999-12-31";

  for (const sibling of siblings) {
    const sibStart = clockTimeToMinutes(sibling.startTime!);
    const sibEnd = clockTimeToMinutes(sibling.endTime!);
    const timeOverlap = candStart < sibEnd && sibStart < candEnd;
    if (!timeOverlap) continue;

    const sibFrom = dbDateToCalendarDate(sibling.effectiveFrom!);
    const sibTo = sibling.effectiveTo ? dbDateToCalendarDate(sibling.effectiveTo) : "9999-12-31";
    const periodOverlap = candFrom <= sibTo && sibFrom <= candTo;

    if (periodOverlap) {
      throw new AvailabilityOverlapError();
    }
  }
}

export async function createAvailability(prisma: PrismaClient, doctorId: string, input: CreateAvailabilityInput) {
  if (input.type === "RECURRING") {
    await assertNoRecurringOverlap(prisma, doctorId, {
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
    });

    return prisma.availability.create({
      data: {
        doctorId,
        type: "RECURRING",
        dayOfWeek: input.dayOfWeek,
        startTime: input.startTime,
        endTime: input.endTime,
        slotDurationMinutes: input.slotDurationMinutes,
        effectiveFrom: toDateOnly(input.effectiveFrom),
        effectiveTo: input.effectiveTo ? toDateOnly(input.effectiveTo) : null,
      },
    });
  }

  const existing = await prisma.availability.findUnique({
    where: { doctorId_specificDate: { doctorId, specificDate: toDateOnly(input.specificDate) } },
  });
  if (existing) {
    throw new DateOverrideAlreadyExistsError();
  }

  return prisma.availability.create({
    data: {
      doctorId,
      type: "DATE_OVERRIDE",
      specificDate: toDateOnly(input.specificDate),
    },
  });
}

export async function updateRecurringAvailability(
  prisma: PrismaClient,
  existing: Availability,
  input: UpdateRecurringAvailabilityInput,
) {
  const merged = {
    dayOfWeek: input.dayOfWeek ?? existing.dayOfWeek!,
    startTime: input.startTime ?? existing.startTime!,
    endTime: input.endTime ?? existing.endTime!,
    slotDurationMinutes: input.slotDurationMinutes ?? existing.slotDurationMinutes!,
    effectiveFrom: input.effectiveFrom ?? dbDateToCalendarDate(existing.effectiveFrom!),
    effectiveTo: input.effectiveTo !== undefined ? input.effectiveTo : existing.effectiveTo ? dbDateToCalendarDate(existing.effectiveTo) : null,
  };

  const start = clockTimeToMinutes(merged.startTime);
  const end = clockTimeToMinutes(merged.endTime);
  if (end <= start) {
    throw new AvailabilityValidationError("L'heure de fin doit être après l'heure de début.");
  }
  if (end - start < merged.slotDurationMinutes) {
    throw new AvailabilityValidationError("La durée d'un créneau ne peut pas dépasser la plage horaire.");
  }
  if (merged.effectiveTo && merged.effectiveTo < merged.effectiveFrom) {
    throw new AvailabilityValidationError("La date de fin d'application doit être postérieure ou égale à la date de début.");
  }

  await assertNoRecurringOverlap(prisma, existing.doctorId, merged, existing.id);

  return prisma.availability.update({
    where: { id: existing.id },
    data: {
      dayOfWeek: merged.dayOfWeek,
      startTime: merged.startTime,
      endTime: merged.endTime,
      slotDurationMinutes: merged.slotDurationMinutes,
      effectiveFrom: toDateOnly(merged.effectiveFrom),
      effectiveTo: merged.effectiveTo ? toDateOnly(merged.effectiveTo) : null,
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
}

export async function updateDateOverrideAvailability(
  prisma: PrismaClient,
  existing: Availability,
  input: UpdateDateOverrideAvailabilityInput,
) {
  if (input.specificDate) {
    const conflict = await prisma.availability.findUnique({
      where: { doctorId_specificDate: { doctorId: existing.doctorId, specificDate: toDateOnly(input.specificDate) } },
    });
    if (conflict && conflict.id !== existing.id) {
      throw new DateOverrideAlreadyExistsError();
    }
  }

  return prisma.availability.update({
    where: { id: existing.id },
    data: {
      ...(input.specificDate ? { specificDate: toDateOnly(input.specificDate) } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
}

export async function deleteAvailability(prisma: PrismaClient, id: string) {
  await prisma.availability.delete({ where: { id } });
}

export type Slot = { startAt: Date; endAt: Date };

/**
 * Calcule les créneaux réellement disponibles d'un médecin sur une
 * période donnée : générés à partir des règles RECURRING actives (dans
 * leur fenêtre d'application), moins les journées bloquées par une
 * DATE_OVERRIDE, moins les créneaux déjà occupés par un rendez-vous actif,
 * moins les créneaux déjà passés. Ne consulte jamais le frontend pour
 * décider — entièrement recalculé côté serveur à chaque appel.
 */
export async function generateAvailableSlots(
  prisma: PrismaClient,
  doctorId: string,
  from: CalendarDate,
  to: CalendarDate,
): Promise<Slot[]> {
  const [recurringRules, overrideRules, appointments] = await Promise.all([
    prisma.availability.findMany({ where: { doctorId, type: "RECURRING", isActive: true } }),
    prisma.availability.findMany({
      where: {
        doctorId,
        type: "DATE_OVERRIDE",
        isActive: true,
        specificDate: { gte: toDateOnly(from), lte: toDateOnly(to) },
      },
    }),
    prisma.appointment.findMany({
      where: {
        doctorId,
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        // Chevauchement d'intervalle avec [from, to), pas une simple
        // correspondance de startAt : un rendez-vous démarré juste avant
        // `from` mais se terminant dedans doit aussi être pris en compte.
        startAt: { lt: localToUtc(addCalendarDays(to, 1), "00:00") },
        endAt: { gt: localToUtc(from, "00:00") },
      },
      select: { startAt: true, endAt: true },
    }),
  ]);

  const blockedDates = new Set(overrideRules.map((rule) => dbDateToCalendarDate(rule.specificDate!)));

  const slots: Slot[] = [];
  const dayCount = calendarDaysBetween(from, to);
  let cursor: CalendarDate = from;

  for (let i = 0; i < dayCount; i += 1) {
    if (!blockedDates.has(cursor)) {
      const dayOfWeek = new Date(`${cursor}T00:00:00.000Z`).getUTCDay();
      const rulesForDay = recurringRules.filter(
        (rule) =>
          rule.dayOfWeek === dayOfWeek &&
          dbDateToCalendarDate(rule.effectiveFrom!) <= cursor &&
          (!rule.effectiveTo || cursor <= dbDateToCalendarDate(rule.effectiveTo)),
      );

      for (const rule of rulesForDay) {
        const endMinutes = clockTimeToMinutes(rule.endTime!);
        let minutes = clockTimeToMinutes(rule.startTime!);
        while (minutes + rule.slotDurationMinutes! <= endMinutes) {
          slots.push({
            startAt: localToUtc(cursor, minutesToClockTime(minutes)),
            endAt: localToUtc(cursor, minutesToClockTime(minutes + rule.slotDurationMinutes!)),
          });
          minutes += rule.slotDurationMinutes!;
        }
      }
    }
    cursor = addCalendarDays(cursor, 1);
  }

  // Chevauchement d'intervalle, pas une simple égalité de startAt : un
  // rendez-vous existant peut provenir d'un ancien planning (durée
  // différente, bornes décalées) et chevaucher partiellement un ou
  // plusieurs créneaux nouvellement générés — ceux-ci doivent alors
  // disparaître même sans correspondance exacte de startAt.
  const overlapsBookedAppointment = (slot: Slot) =>
    appointments.some((appointment) => appointment.startAt.getTime() < slot.endAt.getTime() && appointment.endAt.getTime() > slot.startAt.getTime());

  const now = Date.now();
  return slots
    .filter((slot) => slot.startAt.getTime() > now)
    .filter((slot) => !overlapsBookedAppointment(slot))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/**
 * Validation métier appelée par la future route de réservation (étape 10)
 * AVANT toute tentative d'insertion. Garantit qu'un Appointment ne peut
 * jamais être créé pour un startAt/endAt arbitraire : il doit correspondre
 * exactement à un créneau réellement généré par les Availability du
 * médecin, non déjà occupé, pour un médecin VERIFIED et actif.
 *
 * Ceci NE REMPLACE PAS l'index unique partiel PostgreSQL
 * (`appointments_doctor_slot_unique`) : cette fonction élimine les
 * créneaux hors planning, l'index élimine les doubles réservations
 * concurrentes du même créneau réel. Les deux protections sont
 * nécessaires et doivent toutes deux rester en place.
 */
export async function isSlotBookable(prisma: PrismaClient, doctorId: string, startAt: Date, endAt: Date): Promise<boolean> {
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId }, include: { user: true } });
  if (!doctor || doctor.verificationStatus !== "VERIFIED" || doctor.user.status !== "ACTIVE") {
    return false;
  }

  const day = utcToCalendarDate(startAt);
  const slots = await generateAvailableSlots(prisma, doctorId, day, day);

  return slots.some((slot) => slot.startAt.getTime() === startAt.getTime() && slot.endAt.getTime() === endAt.getTime());
}
