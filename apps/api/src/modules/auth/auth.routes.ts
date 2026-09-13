import type { FastifyInstance } from "fastify";
import { loginSchema, registerSchema } from "./auth.schemas.js";
import { authenticateUser, registerUser } from "./auth.service.js";
import { toPublicUser } from "../users/users.service.js";
import { issueRefreshToken, rotateRefreshToken, revokeRefreshToken, verifyRefreshToken } from "./refresh-token.js";
import { REFRESH_COOKIE_NAME } from "../../plugins/auth.js";

const REFRESH_COOKIE_PATH = "/api/auth";

function refreshCookieOptions(expiresAt: Date) {
  return {
    path: REFRESH_COOKIE_PATH,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    signed: true,
    expires: expiresAt,
  };
}

// Limite dédiée aux routes sensibles aux attaques par force brute
// (login/register), plus stricte que la limite globale de l'API.
const BRUTE_FORCE_RATE_LIMIT = { max: 10, timeWindow: "1 minute" };

// Limite dédiée à `/refresh` (étape 16) : jusqu'ici couverte uniquement par
// la limite globale (200 req/min), alors que c'est une route
// d'authentification comme login/register. Un seuil plus généreux que
// BRUTE_FORCE_RATE_LIMIT reste justifié : le frontend l'appelle légitimement
// à chaque rechargement de page authentifiée (restauration de session), pas
// seulement lors d'une tentative de connexion explicite. 30/min laisse une
// large marge à un usage normal (y compris plusieurs onglets) tout en
// réduisant la fenêtre d'abus par rapport à la seule limite globale.
const REFRESH_RATE_LIMIT = { max: 30, timeWindow: "1 minute" };

export default async function authRoutes(app: FastifyInstance) {
  app.post("/login", { config: { rateLimit: BRUTE_FORCE_RATE_LIMIT } }, async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = await authenticateUser(app.prisma, input);

    const accessToken = await reply.jwtSign({ sub: user.id, role: user.role });
    const { token: refreshToken, expiresAt } = await issueRefreshToken(app.prisma, user.id);

    reply.setCookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions(expiresAt));
    return { accessToken, user: toPublicUser(user) };
  });

  app.post("/register", { config: { rateLimit: BRUTE_FORCE_RATE_LIMIT } }, async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const user = await registerUser(app.prisma, input);
    reply.code(201);
    return { user: toPublicUser(user) };
  });

  app.post("/refresh", { config: { rateLimit: REFRESH_RATE_LIMIT } }, async (request, reply) => {
    const token = request.cookies[REFRESH_COOKIE_NAME];
    const unsigned = token ? request.unsignCookie(token) : null;

    if (!token || !unsigned?.valid || !unsigned.value) {
      reply.code(401).send({ error: "Unauthorized", message: "Session invalide, veuillez vous reconnecter." });
      return;
    }

    const record = await verifyRefreshToken(app.prisma, unsigned.value);
    if (!record) {
      reply.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
      reply.code(401).send({ error: "Unauthorized", message: "Session invalide, veuillez vous reconnecter." });
      return;
    }

    const accessToken = await reply.jwtSign({ sub: record.user.id, role: record.user.role });
    const { token: newRefreshToken, expiresAt } = await rotateRefreshToken(app.prisma, unsigned.value, record.user.id);

    reply.setCookie(REFRESH_COOKIE_NAME, newRefreshToken, refreshCookieOptions(expiresAt));
    return { accessToken };
  });

  app.post("/logout", { preHandler: app.authenticate }, async (request, reply) => {
    const token = request.cookies[REFRESH_COOKIE_NAME];
    const unsigned = token ? request.unsignCookie(token) : null;

    if (unsigned?.valid && unsigned.value) {
      await revokeRefreshToken(app.prisma, unsigned.value);
    }

    reply.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
    reply.code(204);
  });
}
