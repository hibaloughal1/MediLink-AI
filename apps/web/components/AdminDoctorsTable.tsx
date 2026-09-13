"use client";

import { DoctorVerificationBadge } from "@/components/DoctorVerificationBadge";
import { StatusMessage } from "@/components/StatusMessage";
import type { DetailedDoctor } from "@/lib/types";
import fr from "@/locales/fr";

type AdminDoctorsTableProps = {
  doctors: DetailedDoctor[];
  onVerify: (id: string) => void;
  onReject: (id: string) => void;
  onSuspend: (id: string) => void;
  pendingId: string | null;
};

/**
 * Table en lecture/action pour l'admin : ne permet de changer QUE
 * `verificationStatus` (verify/reject/suspend) — aucun champ de profil
 * (bio, adresse, téléphone, spécialités, ville, licenseNumber) n'est
 * modifiable ni même éditable depuis cette table, volontairement.
 */
export function AdminDoctorsTable({ doctors, onVerify, onReject, onSuspend, pendingId }: AdminDoctorsTableProps) {
  const copy = fr.adminDashboard.doctorVerification;

  if (doctors.length === 0) {
    return <StatusMessage type="empty" message={copy.empty} />;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Médecin</th>
            <th className="px-4 py-3">{copy.columnStatus}</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {doctors.map((doctor) => {
            const busy = pendingId === doctor.id;
            return (
              <tr key={doctor.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">
                    {doctor.firstName} {doctor.lastName}
                  </p>
                  <p className="text-xs text-slate-500">{doctor.email}</p>
                </td>
                <td className="px-4 py-3">
                  <DoctorVerificationBadge status={doctor.verificationStatus} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-3">
                    {doctor.verificationStatus !== "VERIFIED" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onVerify(doctor.id)}
                        className="text-sm font-medium text-green-700 hover:underline disabled:opacity-50"
                      >
                        {copy.verifyAction}
                      </button>
                    )}
                    {doctor.verificationStatus !== "REJECTED" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onReject(doctor.id)}
                        className="text-sm font-medium text-amber-700 hover:underline disabled:opacity-50"
                      >
                        {copy.rejectAction}
                      </button>
                    )}
                    {doctor.verificationStatus !== "SUSPENDED" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onSuspend(doctor.id)}
                        className="text-sm font-medium text-red-700 hover:underline disabled:opacity-50"
                      >
                        {copy.suspendAction}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
