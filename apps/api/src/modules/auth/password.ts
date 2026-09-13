import bcrypt from "bcryptjs";

// Coût bcrypt 12 : compromis raisonnable sécurité/latence pour un MVP.
// Réduit uniquement en environnement de test (NODE_ENV=test) pour éviter
// des suites de tests lentes à cause de bcryptjs (implémentation pure JS,
// plus lente que le bcrypt natif) ; n'affecte jamais le hachage en
// développement ou en production.
const SALT_ROUNDS = process.env.NODE_ENV === "test" ? 4 : 12;

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

export async function verifyPassword(plainPassword: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}
