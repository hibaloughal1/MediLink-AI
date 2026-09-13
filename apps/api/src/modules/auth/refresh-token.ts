import { randomBytes, createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

const REFRESH_TOKEN_BYTES = 64;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function getTtlMs(): number {
  const days = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30);
  return days * 24 * 60 * 60 * 1000;
}

/**
 * Émet un nouveau refresh token opaque pour un utilisateur. Seul le hash
 * (SHA-256) est stocké en base : la valeur en clair n'est jamais persistée
 * et n'est renvoyée qu'une seule fois, au client, via un cookie httpOnly.
 */
export async function issueRefreshToken(prisma: PrismaClient, userId: string) {
  const token = randomBytes(REFRESH_TOKEN_BYTES).toString("hex");
  const expiresAt = new Date(Date.now() + getTtlMs());

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
    },
  });

  return { token, expiresAt };
}

/**
 * Vérifie un refresh token présenté par le client : doit exister, ne pas
 * être révoqué, ne pas être expiré, et l'utilisateur associé doit être actif.
 * Retourne l'enregistrement + l'utilisateur si valide, sinon null.
 */
export async function verifyRefreshToken(prisma: PrismaClient, token: string) {
  const tokenHash = hashToken(token);

  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    return null;
  }

  if (record.user.status !== "ACTIVE") {
    return null;
  }

  return record;
}

/** Révoque un refresh token (utilisé à la déconnexion ou lors de la rotation). */
export async function revokeRefreshToken(prisma: PrismaClient, token: string) {
  const tokenHash = hashToken(token);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Révoque en une fois tous les refresh tokens actifs d'un utilisateur
 * (utilisé lors d'une suspension de compte par un ADMIN) : coupe
 * immédiatement toute session existante, plutôt que d'attendre l'expiration
 * naturelle du refresh token ou le prochain appel à `/api/auth/refresh`
 * (qui échouerait de toute façon, `verifyRefreshToken` vérifiant déjà
 * `user.status === "ACTIVE"`, mais sans révoquer explicitement le jeton).
 */
export async function revokeAllRefreshTokensForUser(prisma: PrismaClient, userId: string) {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Rotation : révoque l'ancien refresh token et en émet un nouveau. Limite
 * la fenêtre de rejeu si un refresh token venait à fuiter.
 */
export async function rotateRefreshToken(prisma: PrismaClient, oldToken: string, userId: string) {
  await revokeRefreshToken(prisma, oldToken);
  return issueRefreshToken(prisma, userId);
}
