import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  availabilityRangeQuerySchema,
  createAvailabilitySchema,
  updateDateOverrideAvailabilitySchema,
  updateRecurringAvailabilitySchema,
} from "./availability.schemas.js";
import {
  createAvailability,
  deleteAvailability,
  findAvailabilityById,
  generateAvailableSlots,
  listDoctorAvailability,
  toAvailabilityDto,
  updateDateOverrideAvailability,
  updateRecurringAvailability,
} from "./availability.service.js";
import { findDoctorById, findDoctorByUserId } from "../doctors/doctors.service.js";

async function loadOwnDoctorOr404(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const doctor = await findDoctorByUserId(app.prisma, request.user.sub);
  if (!doctor) {
    reply.code(404).send({ error: "NotFound", message: "Profil médecin non créé." });
    return null;
  }
  return doctor;
}

export default async function availabilityRoutes(app: FastifyInstance) {
  app.get("/me/availability", { preHandler: [app.authenticate, app.authorize("DOCTOR")] }, async (request, reply) => {
    const doctor = await loadOwnDoctorOr404(app, request, reply);
    if (!doctor) return;

    const rules = await listDoctorAvailability(app.prisma, doctor.id);
    return { availability: rules.map(toAvailabilityDto) };
  });

  app.post("/me/availability", { preHandler: [app.authenticate, app.authorize("DOCTOR")] }, async (request, reply) => {
    const doctor = await loadOwnDoctorOr404(app, request, reply);
    if (!doctor) return;

    const input = createAvailabilitySchema.parse(request.body);
    const created = await createAvailability(app.prisma, doctor.id, input);
    reply.code(201);
    return { availability: toAvailabilityDto(created) };
  });

  app.patch<{ Params: { id: string } }>(
    "/me/availability/:id",
    { preHandler: [app.authenticate, app.authorize("DOCTOR")] },
    async (request, reply) => {
      const doctor = await loadOwnDoctorOr404(app, request, reply);
      if (!doctor) return;

      const existing = await findAvailabilityById(app.prisma, request.params.id);
      if (!existing) {
        reply.code(404).send({ error: "NotFound", message: "Règle de disponibilité introuvable." });
        return;
      }
      if (existing.doctorId !== doctor.id) {
        reply.code(403).send({ error: "Forbidden", message: "Vous ne pouvez pas modifier la disponibilité d'un autre médecin." });
        return;
      }

      const updated =
        existing.type === "RECURRING"
          ? await updateRecurringAvailability(app.prisma, existing, updateRecurringAvailabilitySchema.parse(request.body))
          : await updateDateOverrideAvailability(app.prisma, existing, updateDateOverrideAvailabilitySchema.parse(request.body));

      return { availability: toAvailabilityDto(updated) };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/me/availability/:id",
    { preHandler: [app.authenticate, app.authorize("DOCTOR")] },
    async (request, reply) => {
      const doctor = await loadOwnDoctorOr404(app, request, reply);
      if (!doctor) return;

      const existing = await findAvailabilityById(app.prisma, request.params.id);
      if (!existing) {
        reply.code(404).send({ error: "NotFound", message: "Règle de disponibilité introuvable." });
        return;
      }
      if (existing.doctorId !== doctor.id) {
        reply.code(403).send({ error: "Forbidden", message: "Vous ne pouvez pas supprimer la disponibilité d'un autre médecin." });
        return;
      }

      await deleteAvailability(app.prisma, existing.id);
      reply.code(204);
    },
  );

  // Public : créneaux calculés, uniquement pour un médecin VERIFIED + actif
  // (même règle de visibilité que GET /api/doctors/:id).
  app.get<{ Params: { id: string } }>("/:id/availability", async (request, reply) => {
    const doctor = await findDoctorById(app.prisma, request.params.id);
    if (!doctor || doctor.verificationStatus !== "VERIFIED" || doctor.user.status !== "ACTIVE") {
      reply.code(404).send({ error: "NotFound", message: "Médecin introuvable." });
      return;
    }

    const query = availabilityRangeQuerySchema.parse(request.query);
    const slots = await generateAvailableSlots(app.prisma, doctor.id, query.from, query.to);
    return {
      doctorId: doctor.id,
      from: query.from,
      to: query.to,
      slots: slots.map((slot) => ({ startAt: slot.startAt.toISOString(), endAt: slot.endAt.toISOString() })),
    };
  });
}
