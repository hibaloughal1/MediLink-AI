import type { VerificationStatus } from "@/lib/types";
import fr from "@/locales/fr";

const STYLES: Record<VerificationStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  VERIFIED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  SUSPENDED: "bg-slate-200 text-slate-700",
};

/**
 * Statut de VÉRIFICATION d'un profil médecin (PENDING/VERIFIED/REJECTED/
 * SUSPENDED) — une notion distincte du statut ACTIVE/SUSPENDED d'un compte
 * utilisateur (voir `UserStatusBadge`). Ne jamais fusionner les deux dans un
 * seul badge/colonne.
 */
export function DoctorVerificationBadge({ status }: { status: VerificationStatus }) {
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${STYLES[status]}`}>
      {fr.adminDashboard.doctorVerification.label[status]}
    </span>
  );
}
