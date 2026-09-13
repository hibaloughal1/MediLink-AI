import fr from "@/locales/fr";

const STYLES: Record<"ACTIVE" | "SUSPENDED", string> = {
  ACTIVE: "bg-green-100 text-green-800",
  SUSPENDED: "bg-red-100 text-red-800",
};

/**
 * Statut du COMPTE utilisateur (ACTIVE/SUSPENDED) — une notion distincte du
 * statut de vérification d'un profil médecin (PENDING/VERIFIED/REJECTED/
 * SUSPENDED, voir `DoctorVerificationBadge`). Ne jamais fusionner les deux
 * dans un seul badge/colonne.
 */
export function UserStatusBadge({ status }: { status: "ACTIVE" | "SUSPENDED" }) {
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${STYLES[status]}`}>
      {fr.adminDashboard.users.accountStatus[status]}
    </span>
  );
}
