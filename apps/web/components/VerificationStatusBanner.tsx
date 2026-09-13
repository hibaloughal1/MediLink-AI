import type { VerificationStatus } from "@/lib/types";
import fr from "@/locales/fr";

const STYLES: Record<VerificationStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  VERIFIED: "border-green-200 bg-green-50 text-green-800",
  REJECTED: "border-red-200 bg-red-50 text-red-800",
  SUSPENDED: "border-slate-300 bg-slate-100 text-slate-700",
};

/** Affichage seul du statut de vérification du médecin — aucun contrôle
 * permettant de le modifier (impossible côté API pour un DOCTOR). */
export function VerificationStatusBanner({ status }: { status: VerificationStatus }) {
  const copy = fr.doctorDashboard.status[status];
  return (
    <div role="status" className={`rounded-lg border p-4 ${STYLES[status]}`}>
      <p className="font-semibold">{copy.label}</p>
      <p className="mt-1 text-sm">{copy.message}</p>
    </div>
  );
}
