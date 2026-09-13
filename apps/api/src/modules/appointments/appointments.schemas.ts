import { z } from "zod";

// startAt/endAt doivent être repris tels quels de la réponse
// GET /api/doctors/:id/availability (ISO-8601 UTC) — jamais recalculés
// côté client. `patientId` n'apparaît jamais ici : il est toujours dérivé
// de `request.user.sub`, jamais accepté depuis le corps de la requête.
export const createAppointmentSchema = z
  .object({
    doctorId: z.string().uuid(),
    startAt: z.string().datetime({ message: "startAt doit être une date ISO-8601 UTC." }),
    endAt: z.string().datetime({ message: "endAt doit être une date ISO-8601 UTC." }),
  })
  .refine((data) => new Date(data.endAt).getTime() > new Date(data.startAt).getTime(), {
    message: "endAt doit être postérieure à startAt.",
    path: ["endAt"],
  });

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const listAppointmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListAppointmentsQuery = z.infer<typeof listAppointmentsQuerySchema>;
