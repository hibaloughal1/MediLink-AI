import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  containsForbiddenSelfUpdateFields,
  createDoctorProfileSchema,
  searchDoctorsQuerySchema,
  updateDoctorProfileSchema,
} from "./doctors.schemas.js";
import {
  createDoctorProfile,
  findDoctorById,
  findDoctorByUserId,
  searchPublicDoctors,
  toDetailedDoctor,
  toPublicDoctor,
  updateDoctorProfile,
} from "./doctors.service.js";

function forbidVerificationStatusChange(request: FastifyRequest, reply: FastifyReply): boolean {
  if (containsForbiddenSelfUpdateFields(request.body)) {
    reply.code(403).send({
      error: "Forbidden",
      message: "Le statut de vérification ne peut être modifié que par un administrateur.",
    });
    return true;
  }
  return false;
}

export default async function doctorsRoutes(app: FastifyInstance) {
  // Recherche publique : uniquement les médecins VERIFIED et actifs.
  app.get("/", async (request) => {
    const query = searchDoctorsQuerySchema.parse(request.query);
    const { items, total } = await searchPublicDoctors(app.prisma, query);
    return { doctors: items.map(toPublicDoctor), total, page: query.page, limit: query.limit };
  });

  // Doit être déclaré avant "/:id" pour ne pas être capturé par la route paramétrée.
  app.get("/me", { preHandler: [app.authenticate, app.authorize("DOCTOR")] }, async (request, reply) => {
    const doctor = await findDoctorByUserId(app.prisma, request.user.sub);
    if (!doctor) {
      reply.code(404).send({ error: "NotFound", message: "Profil médecin non créé." });
      return;
    }
    return { doctor: toDetailedDoctor(doctor) };
  });

  app.post("/", { preHandler: [app.authenticate, app.authorize("DOCTOR")] }, async (request, reply) => {
    const input = createDoctorProfileSchema.parse(request.body);
    const doctor = await createDoctorProfile(app.prisma, request.user.sub, input);
    reply.code(201);
    return { doctor: toDetailedDoctor(doctor) };
  });

  app.patch("/me", { preHandler: [app.authenticate, app.authorize("DOCTOR")] }, async (request, reply) => {
    if (forbidVerificationStatusChange(request, reply)) return;

    const doctor = await findDoctorByUserId(app.prisma, request.user.sub);
    if (!doctor) {
      reply.code(404).send({ error: "NotFound", message: "Profil médecin non créé." });
      return;
    }

    const input = updateDoctorProfileSchema.parse(request.body);
    const updated = await updateDoctorProfile(app.prisma, doctor.id, input);
    return { doctor: toDetailedDoctor(updated) };
  });

  // Route générique avec :id, réservée au propriétaire du profil ou à l'ADMIN
  // (même protection anti-IDOR que /api/users/:id à l'étape 7).
  app.patch<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [app.authenticate, app.authorize("DOCTOR", "ADMIN")] },
    async (request, reply) => {
      if (forbidVerificationStatusChange(request, reply)) return;

      const doctor = await findDoctorById(app.prisma, request.params.id);
      if (!doctor) {
        reply.code(404).send({ error: "NotFound", message: "Médecin introuvable." });
        return;
      }

      const isOwner = doctor.userId === request.user.sub;
      if (!isOwner && request.user.role !== "ADMIN") {
        reply.code(403).send({ error: "Forbidden", message: "Vous ne pouvez pas modifier le profil d'un autre médecin." });
        return;
      }

      const input = updateDoctorProfileSchema.parse(request.body);
      const updated = await updateDoctorProfile(app.prisma, doctor.id, input);
      return { doctor: toDetailedDoctor(updated) };
    },
  );

  // Fiche publique d'un médecin : uniquement s'il est VERIFIED (et actif),
  // sinon 404 (on ne révèle pas l'existence d'un profil non validé/suspendu).
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const doctor = await findDoctorById(app.prisma, request.params.id);
    if (!doctor || doctor.verificationStatus !== "VERIFIED" || doctor.user.status !== "ACTIVE") {
      reply.code(404).send({ error: "NotFound", message: "Médecin introuvable." });
      return;
    }
    return { doctor: toPublicDoctor(doctor) };
  });
}
