import type { PrismaClient } from "@prisma/client";
import { hashPassword, verifyPassword } from "./password.js";
import type { LoginInput, RegisterInput } from "./auth.schemas.js";

export class EmailAlreadyUsedError extends Error {
  constructor() {
    super("Cette adresse e-mail est déjà utilisée.");
    this.name = "EmailAlreadyUsedError";
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    // Message volontairement générique : on ne révèle jamais si c'est
    // l'email ou le mot de passe qui est incorrect (évite l'énumération
    // de comptes).
    super("Identifiants invalides.");
    this.name = "InvalidCredentialsError";
  }
}

export async function registerUser(prisma: PrismaClient, input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new EmailAlreadyUsedError();
  }

  const passwordHash = await hashPassword(input.password);

  return prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      role: input.role,
    },
  });
}

export async function authenticateUser(prisma: PrismaClient, input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw new InvalidCredentialsError();
  }

  const passwordMatches = await verifyPassword(input.password, user.passwordHash);
  if (!passwordMatches) {
    throw new InvalidCredentialsError();
  }

  if (user.status !== "ACTIVE") {
    throw new InvalidCredentialsError();
  }

  return user;
}
