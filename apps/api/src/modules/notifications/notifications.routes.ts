import type { FastifyInstance } from "fastify";
import { listNotificationsQuerySchema } from "./notifications.schemas.js";
import {
  findNotificationById,
  listMyNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  toNotificationDto,
} from "./notifications.service.js";

// Ouvert à tout utilisateur authentifié (PATIENT/DOCTOR/ADMIN) : chacun ne
// voit et ne modifie jamais que ses propres notifications
// (`request.user.sub`), jamais un id arbitraire — même garde IDOR que
// `/api/users/me`, `/api/doctors/me/*`.
export default async function notificationsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/me", async (request) => {
    const query = listNotificationsQuerySchema.parse(request.query);
    const { items, total } = await listMyNotifications(app.prisma, request.user.sub, {
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      unreadOnly: query.unreadOnly,
    });
    return { notifications: items.map(toNotificationDto), total, page: query.page, limit: query.limit };
  });

  // Déclarée avant "/me/:id/read" dans le fichier pour la lisibilité, mais
  // sans ambiguïté de routage possible : nombre de segments différent
  // ("me/read-all" vs "me/:id/read").
  app.patch("/me/read-all", async (request) => {
    const result = await markAllNotificationsAsRead(app.prisma, request.user.sub);
    return { updated: result.count };
  });

  app.patch<{ Params: { id: string } }>("/me/:id/read", async (request, reply) => {
    const notification = await findNotificationById(app.prisma, request.params.id);
    if (!notification) {
      reply.code(404).send({ error: "NotFound", message: "Notification introuvable." });
      return;
    }
    if (notification.userId !== request.user.sub) {
      reply.code(403).send({ error: "Forbidden", message: "Vous ne pouvez pas accéder aux notifications d'un autre utilisateur." });
      return;
    }

    const updated = await markNotificationAsRead(app.prisma, notification.id);
    return { notification: toNotificationDto(updated) };
  });
}
