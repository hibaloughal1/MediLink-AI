import { z } from "zod";

// Champs communs à la création et à la mise à jour du profil professionnel.
// `verificationStatus`/`verifiedAt` sont volontairement absents de ces
// schémas : ils ne sont modifiables que via les routes d'administration
// dédiées (/api/admin/doctors/:id/verify|reject|suspend).
const doctorProfileFields = {
  cityId: z.string().uuid(),
  address: z.string().trim().min(1).max(255),
  bio: z.string().trim().max(2000).optional(),
  professionalPhone: z.string().trim().min(6).max(20).optional(),
  licenseNumber: z.string().trim().min(1).max(100).optional(),
  specialtyIds: z.array(z.string().uuid()).min(1, "Au moins une spécialité est requise."),
};

export const createDoctorProfileSchema = z.object(doctorProfileFields);
export type CreateDoctorProfileInput = z.infer<typeof createDoctorProfileSchema>;

export const updateDoctorProfileSchema = z
  .object({
    cityId: doctorProfileFields.cityId.optional(),
    address: doctorProfileFields.address.optional(),
    bio: doctorProfileFields.bio,
    professionalPhone: doctorProfileFields.professionalPhone,
    licenseNumber: doctorProfileFields.licenseNumber,
    specialtyIds: doctorProfileFields.specialtyIds.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "Aucun champ à mettre à jour." });
export type UpdateDoctorProfileInput = z.infer<typeof updateDoctorProfileSchema>;

export const searchDoctorsQuerySchema = z.object({
  specialty: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type SearchDoctorsQuery = z.infer<typeof searchDoctorsQuerySchema>;

// Filtre optionnel pour la liste ADMIN (`GET /api/admin/doctors`).
// Rétrocompatible : un appel sans `status` se comporte exactement comme
// avant (tous statuts confondus).
export const adminListDoctorsQuerySchema = z.object({
  status: z.enum(["PENDING", "VERIFIED", "REJECTED", "SUSPENDED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminListDoctorsQuery = z.infer<typeof adminListDoctorsQuerySchema>;

// Champs interdits en mise à jour "self-service" (DOCTOR) : seule
// l'administration peut faire transitionner le statut de vérification.
export const FORBIDDEN_SELF_UPDATE_FIELDS = ["verificationStatus", "verifiedAt"] as const;

export function containsForbiddenSelfUpdateFields(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  return FORBIDDEN_SELF_UPDATE_FIELDS.some((field) => field in (body as Record<string, unknown>));
}
