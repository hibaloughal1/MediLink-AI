import fp from "fastify-plugin";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Role } from "@prisma/client";

export type AccessTokenPayload = {
  sub: string;
  role: Role;
};

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AccessTokenPayload;
    user: AccessTokenPayload;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize: (...roles: Role[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const REFRESH_COOKIE_NAME = "medilink_refresh";

/**
 * Enregistre le support JWT (access token) + cookies (refresh token) et
 * expose deux garde-fous réutilisables sur toutes les routes protégées :
 *  - `authenticate` : exige un access token valide.
 *  - `authorize(...roles)` : exige en plus que le rôle de l'utilisateur
 *    fasse partie de la liste autorisée (RBAC).
 */
export default fp(async function authPlugin(app: FastifyInstance) {
  const accessSecret = process.env.JWT_ACCESS_SECRET;
  const cookieSecret = process.env.COOKIE_SECRET;

  if (!accessSecret) {
    throw new Error("JWT_ACCESS_SECRET n'est pas défini.");
  }
  if (!cookieSecret) {
    throw new Error("COOKIE_SECRET n'est pas défini.");
  }

  await app.register(cookie, { secret: cookieSecret });

  await app.register(jwt, {
    secret: accessSecret,
    sign: { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m" },
  });

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ error: "Unauthorized", message: "Token invalide ou manquant." });
    }
  });

  app.decorate("authorize", (...roles: Role[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user || !roles.includes(request.user.role)) {
        reply.code(403).send({ error: "Forbidden", message: "Accès refusé pour ce rôle." });
      }
    };
  });
});
