import type { FastifyInstance } from "fastify";
import { findUserById, reactivateUser, suspendUser, toPublicUser } from "./users.service.js";

// Distinct de `/api/users` (self-service) : ces routes ne portent que la
// transition ACTIVE/SUSPENDED d'un compte, jamais le rôle ni les autres
// champs de profil (cohérent avec `/api/admin/doctors/:id/verify|reject|suspend`,
// qui ne modifie que `verificationStatus`).
export default async function usersAdminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.authorize("ADMIN"));

  app.patch<{ Params: { id: string } }>("/:id/suspend", async (request, reply) => {
    const target = await findUserById(app.prisma, request.params.id);
    if (!target) {
      reply.code(404).send({ error: "NotFound", message: "Utilisateur introuvable." });
      return;
    }

    if (target.id === request.user.sub) {
      reply.code(403).send({ error: "Forbidden", message: "Vous ne pouvez pas suspendre votre propre compte." });
      return;
    }

    if (target.role === "ADMIN") {
      reply.code(403).send({ error: "Forbidden", message: "Impossible de suspendre un compte administrateur." });
      return;
    }

    const updated = await suspendUser(app.prisma, target);
    return { user: toPublicUser(updated) };
  });

  app.patch<{ Params: { id: string } }>("/:id/reactivate", async (request, reply) => {
    const target = await findUserById(app.prisma, request.params.id);
    if (!target) {
      reply.code(404).send({ error: "NotFound", message: "Utilisateur introuvable." });
      return;
    }

    const updated = await reactivateUser(app.prisma, target);
    return { user: toPublicUser(updated) };
  });
}
