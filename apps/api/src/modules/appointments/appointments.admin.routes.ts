import type { FastifyInstance } from "fastify";
import { listAppointmentsQuerySchema } from "./appointments.schemas.js";
import { listAllAppointmentsForAdmin, toAdminAppointmentDto } from "./appointments.service.js";

export default async function adminAppointmentsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.authorize("ADMIN"));

  app.get("/", async (request) => {
    const query = listAppointmentsQuerySchema.parse(request.query);
    const { items, total } = await listAllAppointmentsForAdmin(app.prisma, {
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return { appointments: items.map(toAdminAppointmentDto), total, page: query.page, limit: query.limit };
  });
}
