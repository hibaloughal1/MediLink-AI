import { z } from "zod";

// L'inscription publique n'autorise que PATIENT ou DOCTOR : un compte ADMIN
// ne peut jamais être créé via cette route (cf. règle métier §9 du cahier
// des charges : rôles sensibles hors auto-inscription).
export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères."),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(6).max(20).optional(),
  role: z.enum(["PATIENT", "DOCTOR"]).default("PATIENT"),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;
