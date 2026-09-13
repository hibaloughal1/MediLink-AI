import { z } from "zod";

// Mise à jour du profil : volontairement restreint aux champs d'identité de
// base. Le changement d'email/mot de passe et la gestion du rôle/statut ne
// sont pas exposés ici (hors périmètre de l'étape Auth/Users).
export const updateProfileSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    phone: z.string().trim().min(6).max(20).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Aucun champ à mettre à jour.",
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// Filtres optionnels pour la liste ADMIN (`GET /api/users`). Rétrocompatible :
// tous les champs sont optionnels, un appel sans filtre se comporte
// exactement comme avant (page 1, pageSize 20).
export const adminListUsersQuerySchema = z.object({
  role: z.enum(["PATIENT", "DOCTOR", "ADMIN"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminListUsersQuery = z.infer<typeof adminListUsersQuerySchema>;
