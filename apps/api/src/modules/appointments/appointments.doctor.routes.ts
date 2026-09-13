import type { FastifyInstance } from "fastify";
import { listAppointmentsQuerySchema } from "./appointments.schemas.js";
import { cancelAppointment, findAppointmentById, listDoctorAppointments, toDoctorAppointmentDto } from "./appointments.service.js";
import { findDoctorByUserId } from "../doctors/doctors.service.js";
import { notifyAppointmentCancelled } from "../notifications/notifications.service.js";

export default async function doctorAppointmentsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.authorize("DOCTOR"));

  app.get("/me/appointments", async (request, reply) => {
    const doctor = await findDoctorByUserId(app.prisma, request.user.sub);
    if (!doctor) {
      reply.code(404).send({ error: "NotFound", message: "Profil médecin non créé." });
      return;
    }

    const query = listAppointmentsQuerySchema.parse(request.query);
    const { items, total } = await listDoctorAppointments(app.prisma, doctor.id, {
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return { appointments: items.map(toDoctorAppointmentDto), total, page: query.page, limit: query.limit };
  });

  app.patch<{ Params: { id: string } }>("/me/appointments/:id/cancel", async (request, reply) => {
    const doctor = await findDoctorByUserId(app.prisma, request.user.sub);
    if (!doctor) {
      reply.code(404).send({ error: "NotFound", message: "Profil médecin non créé." });
      return;
    }

    const appointment = await findAppointmentById(app.prisma, request.params.id);
    if (!appointment) {
      reply.code(404).send({ error: "NotFound", message: "Rendez-vous introuvable." });
      return;
    }
    if (appointment.doctorId !== doctor.id) {
      reply.code(403).send({ error: "Forbidden", message: "Vous ne pouvez pas annuler le rendez-vous d'un autre médecin." });
      return;
    }

    const cancelled = await cancelAppointment(app.prisma, appointment);
    await notifyAppointmentCancelled(app.prisma, app.emailTransport, cancelled.id, "DOCTOR");
    return { appointment: toDoctorAppointmentDto(cancelled) };
  });
}
