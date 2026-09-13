import type { PrismaClient, Role, User, UserStatus } from "@prisma/client";
import type { UpdateProfileInput } from "./users.schemas.js";
import { revokeAllRefreshTokensForUser } from "../auth/refresh-token.js";

export class UserAlreadySuspendedError extends Error {
  constructor() {
    super("Ce compte est déjà suspendu.");
    this.name = "UserAlreadySuspendedError";
  }
}

export class UserAlreadyActiveError extends Error {
  constructor() {
    super("Ce compte est déjà actif.");
    this.name = "UserAlreadyActiveError";
  }
}

// Vue publique d'un utilisateur : ne contient jamais passwordHash.
export function toPublicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function findUserById(prisma: PrismaClient, id: string) {
  return prisma.user.findUnique({ where: { id } });
}

export async function updateUserProfile(prisma: PrismaClient, id: string, input: UpdateProfileInput) {
  return prisma.user.update({
    where: { id },
    data: {
      ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
    },
  });
}

export async function listUsers(
  prisma: PrismaClient,
  params: { skip: number; take: number; role?: Role; status?: UserStatus },
) {
  const where = {
    ...(params.role ? { role: params.role } : {}),
    ...(params.status ? { status: params.status } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: params.skip,
      take: params.take,
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.count({ where }),
  ]);

  return { items, total };
}

/**
 * Suspend un compte : `status -> SUSPENDED` puis révoque immédiatement toute
 * session active (refresh tokens). Les vérifications d'autorisation
 * (auto-suspension, suspension d'un autre ADMIN) sont faites par l'appelant
 * (route), qui a déjà dû charger `user` pour les effectuer — cette fonction
 * ne fait que la transition d'état et son effet de bord.
 */
export async function suspendUser(prisma: PrismaClient, user: User) {
  if (user.status === "SUSPENDED") {
    throw new UserAlreadySuspendedError();
  }
  const updated = await prisma.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
  await revokeAllRefreshTokensForUser(prisma, user.id);
  return updated;
}

/** Réactive un compte suspendu : `status -> ACTIVE`. Aucune restriction d'auto-réactivation ou ciblant un ADMIN. */
export async function reactivateUser(prisma: PrismaClient, user: User) {
  if (user.status === "ACTIVE") {
    throw new UserAlreadyActiveError();
  }
  return prisma.user.update({ where: { id: user.id }, data: { status: "ACTIVE" } });
}
