import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { adminListUsersQuerySchema, updateProfileSchema } from "./users.schemas.js";
import { findUserById, listUsers, toPublicUser, updateUserProfile } from "./users.service.js";

/**
 * Un utilisateur ne peut consulter/modifier que sa propre fiche, sauf un
 * ADMIN qui peut accéder à n'importe quelle fiche. Protège explicitement
 * contre l'IDOR (changer l'id dans l'URL pour agir sur un autre compte).
 */
function assertSelfOrAdmin(request: FastifyRequest, reply: FastifyReply, targetId: string): boolean {
  if (request.user.sub === targetId || request.user.role === "ADMIN") {
    return true;
  }
  reply.code(403).send({ error: "Forbidden", message: "Vous ne pouvez pas accéder au profil d'un autre utilisateur." });
  return false;
}

export default async function usersRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/me", async (request, reply) => {
    const user = await findUserById(app.prisma, request.user.sub);
    if (!user) {
      reply.code(404).send({ error: "NotFound", message: "Utilisateur introuvable." });
      return;
    }
    return { user: toPublicUser(user) };
  });

  app.patch("/me", async (request) => {
    const input = updateProfileSchema.parse(request.body);
    const user = await updateUserProfile(app.prisma, request.user.sub, input);
    return { user: toPublicUser(user) };
  });

  app.get("/", { preHandler: app.authorize("ADMIN") }, async (request) => {
    const query = adminListUsersQuerySchema.parse(request.query);

    const { items, total } = await listUsers(app.prisma, {
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      role: query.role,
      status: query.status,
    });
    return { users: items.map(toPublicUser), total, page: query.page, pageSize: query.pageSize };
  });

  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    if (!assertSelfOrAdmin(request, reply, request.params.id)) return;

    const user = await findUserById(app.prisma, request.params.id);
    if (!user) {
      reply.code(404).send({ error: "NotFound", message: "Utilisateur introuvable." });
      return;
    }
    return { user: toPublicUser(user) };
  });

  app.patch<{ Params: { id: string } }>("/:id", async (request, reply) => {
    if (!assertSelfOrAdmin(request, reply, request.params.id)) return;

    const existing = await findUserById(app.prisma, request.params.id);
    if (!existing) {
      reply.code(404).send({ error: "NotFound", message: "Utilisateur introuvable." });
      return;
    }

    const input = updateProfileSchema.parse(request.body);
    const user = await updateUserProfile(app.prisma, request.params.id, input);
    return { user: toPublicUser(user) };
  });
}
