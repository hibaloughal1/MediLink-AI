import type { FastifyInstance } from "fastify";
import { adminListDoctorsQuerySchema } from "./doctors.schemas.js";
import { findDoctorById, listAllDoctorsForAdmin, setDoctorVerificationStatus, toDetailedDoctor } from "./doctors.service.js";

async function transitionStatus(
  app: FastifyInstance,
  id: string,
  status: "VERIFIED" | "REJECTED" | "SUSPENDED",
) {
  const doctor = await findDoctorById(app.prisma, id);
  if (!doctor) return null;
  return setDoctorVerificationStatus(app.prisma, id, status);
}

export default async function doctorsAdminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.authorize("ADMIN"));

  app.get("/", async (request) => {
    const query = adminListDoctorsQuerySchema.parse(request.query);

    const { items, total } = await listAllDoctorsForAdmin(app.prisma, {
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      status: query.status,
    });
    return { doctors: items.map(toDetailedDoctor), total, page: query.page, limit: query.limit };
  });

  app.patch<{ Params: { id: string } }>("/:id/verify", async (request, reply) => {
    const updated = await transitionStatus(app, request.params.id, "VERIFIED");
    if (!updated) {
      reply.code(404).send({ error: "NotFound", message: "Médecin introuvable." });
      return;
    }
    return { doctor: toDetailedDoctor(updated) };
  });

  app.patch<{ Params: { id: string } }>("/:id/reject", async (request, reply) => {
    const updated = await transitionStatus(app, request.params.id, "REJECTED");
    if (!updated) {
      reply.code(404).send({ error: "NotFound", message: "Médecin introuvable." });
      return;
    }
    return { doctor: toDetailedDoctor(updated) };
  });

  app.patch<{ Params: { id: string } }>("/:id/suspend", async (request, reply) => {
    const updated = await transitionStatus(app, request.params.id, "SUSPENDED");
    if (!updated) {
      reply.code(404).send({ error: "NotFound", message: "Médecin introuvable." });
      return;
    }
    return { doctor: toDetailedDoctor(updated) };
  });
}
