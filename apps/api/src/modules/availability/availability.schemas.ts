import { z } from "zod";
import { calendarDaysBetween, clockTimeToMinutes } from "../../lib/timezone.js";

const CLOCK_TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const CALENDAR_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const MIN_SLOT_DURATION_MINUTES = 5;
export const MAX_SLOT_DURATION_MINUTES = 240;
export const MAX_RANGE_DAYS = 60;

const clockTime = z.string().regex(CLOCK_TIME_REGEX, "Heure invalide (format HH:mm attendu).");
const calendarDate = z.string().regex(CALENDAR_DATE_REGEX, "Date invalide (format YYYY-MM-DD attendu).");
const slotDuration = z
  .number()
  .int()
  .min(MIN_SLOT_DURATION_MINUTES, `La durée minimale d'un créneau est de ${MIN_SLOT_DURATION_MINUTES} minutes.`)
  .max(MAX_SLOT_DURATION_MINUTES, `La durée maximale d'un créneau est de ${MAX_SLOT_DURATION_MINUTES} minutes.`);

function refineRecurringConsistency(
  data: { startTime: string; endTime: string; slotDurationMinutes: number; effectiveFrom: string; effectiveTo?: string | null },
  ctx: z.RefinementCtx,
) {
  const start = clockTimeToMinutes(data.startTime);
  const end = clockTimeToMinutes(data.endTime);

  if (end <= start) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "L'heure de fin doit être après l'heure de début.", path: ["endTime"] });
    return;
  }

  if (end - start < data.slotDurationMinutes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "La durée d'un créneau ne peut pas dépasser la plage horaire.",
      path: ["slotDurationMinutes"],
    });
  }

  if (data.effectiveTo && data.effectiveTo < data.effectiveFrom) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "La date de fin d'application doit être postérieure ou égale à la date de début.",
      path: ["effectiveTo"],
    });
  }
}

// --- Création ---

const createRecurringSchema = z.object({
  type: z.literal("RECURRING"),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: clockTime,
  endTime: clockTime,
  slotDurationMinutes: slotDuration,
  effectiveFrom: calendarDate,
  effectiveTo: calendarDate.nullable().optional(),
});

const createDateOverrideSchema = z.object({
  type: z.literal("DATE_OVERRIDE"),
  specificDate: calendarDate,
});

export const createAvailabilitySchema = z
  .discriminatedUnion("type", [createRecurringSchema, createDateOverrideSchema])
  .superRefine((data, ctx) => {
    if (data.type === "RECURRING") refineRecurringConsistency(data, ctx);
  });

export type CreateAvailabilityInput = z.infer<typeof createAvailabilitySchema>;

// --- Mise à jour ---
// Le type d'une règle n'est jamais modifiable après création (une
// RECURRING ne devient pas une DATE_OVERRIDE) : le schéma applicable est
// déterminé côté service à partir de la règle existante en base.

export const updateRecurringAvailabilitySchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    startTime: clockTime.optional(),
    endTime: clockTime.optional(),
    slotDurationMinutes: slotDuration.optional(),
    effectiveFrom: calendarDate.optional(),
    effectiveTo: calendarDate.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "Aucun champ à mettre à jour." });

export type UpdateRecurringAvailabilityInput = z.infer<typeof updateRecurringAvailabilitySchema>;

export const updateDateOverrideAvailabilitySchema = z
  .object({
    specificDate: calendarDate.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "Aucun champ à mettre à jour." });

export type UpdateDateOverrideAvailabilityInput = z.infer<typeof updateDateOverrideAvailabilitySchema>;

// --- Recherche de créneaux publics ---

export const availabilityRangeQuerySchema = z
  .object({
    from: calendarDate,
    to: calendarDate,
  })
  .refine((data) => data.from <= data.to, { message: "'from' doit être antérieure ou égale à 'to'.", path: ["from"] })
  .refine((data) => calendarDaysBetween(data.from, data.to) <= MAX_RANGE_DAYS, {
    message: `La période demandée ne peut pas dépasser ${MAX_RANGE_DAYS} jours.`,
    path: ["to"],
  });

export type AvailabilityRangeQuery = z.infer<typeof availabilityRangeQuerySchema>;
