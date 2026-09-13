import type { FastifyInstance } from "fastify";
import { createAppointmentSchema, listAppointmentsQuerySchema } from "./appointments.schemas.js";
import { cancelAppointment, createAppointment, findAppointmentById, listPatientAppointments, toPatientAppointmentDto } from "./appointments.service.js";
import { findDoctorById } from "../doctors/doctors.service.js";
import { notifyAppointmentBooked, notifyAppointmentCancelled } from "../notifications/notifications.service.js";

export default async function appointmentsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.authorize("PATIENT"));

  app.post("/", async (request, reply) => {
    const input = createAppointmentSchema.parse(request.body);

    const doctor = await findDoctorById(app.prisma, input.doctorId);
    if (!doctor) {
      reply.code(404).send({ error: "NotFound", message: "Médecin introuvable." });
      return;
    }

    const appointment = await createAppointment(app.prisma, {
      doctorId: input.doctorId,
      patientId: request.user.sub,
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
    });

    // Best-effort : ne peut jamais transformer ce 201 en erreur (voir
    // notifications.service.ts, qui capture toute erreur en interne).
    await notifyAppointmentBooked(app.prisma, app.emailTransport, appointment.id);

    reply.code(201);
    return { appointment: toPatientAppointmentDto(appointment) };
  });

  app.get("/me", async (request) => {
    const query = listAppointmentsQuerySchema.parse(request.query);
    const { items, total } = await listPatientAppointments(app.prisma, request.user.sub, {
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return { appointments: items.map(toPatientAppointmentDto), total, page: query.page, limit: query.limit };
  });

  app.patch<{ Params: { id: string } }>("/:id/cancel", async (request, reply) => {
    const appointment = await findAppointmentById(app.prisma, request.params.id);
    if (!appointment) {
      reply.code(404).send({ error: "NotFound", message: "Rendez-vous introuvable." });
      return;
    }
    if (appointment.patientId !== request.user.sub) {
      reply.code(403).send({ error: "Forbidden", message: "Vous ne pouvez pas annuler le rendez-vous d'un autre patient." });
      return;
    }

    const cancelled = await cancelAppointment(app.prisma, appointment);
    await notifyAppointmentCancelled(app.prisma, app.emailTransport, cancelled.id, "PATIENT");
    return { appointment: toPatientAppointmentDto(cancelled) };
  });
}
