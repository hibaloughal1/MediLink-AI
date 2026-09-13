import { StatusMessage } from "@/components/StatusMessage";
import { formatDateTimeLabel } from "@/lib/format";
import type { AdminAppointment } from "@/lib/types";
import fr from "@/locales/fr";

const STATUS_BADGE_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-green-100 text-green-800",
  CANCELLED: "bg-slate-200 text-slate-600",
  COMPLETED: "bg-blue-100 text-blue-800",
  NO_SHOW: "bg-red-100 text-red-800",
};

/**
 * Table strictement en lecture seule : aucun bouton d'action (annulation,
 * modification, suppression) n'existe ici, volontairement — `GET
 * /api/admin/appointments` n'a d'ailleurs aucune contrepartie de mutation
 * côté API.
 */
export function AdminAppointmentsTable({ appointments }: { appointments: AdminAppointment[] }) {
  const copy = fr.adminDashboard.appointments;

  if (appointments.length === 0) {
    return <StatusMessage type="empty" message={copy.empty} />;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">{copy.columnDoctor}</th>
            <th className="px-4 py-3">{copy.columnPatient}</th>
            <th className="px-4 py-3">{copy.columnDate}</th>
            <th className="px-4 py-3">{copy.columnStatus}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {appointments.map((appointment) => (
            <tr key={appointment.id}>
              <td className="px-4 py-3 text-slate-900">{appointment.doctorName}</td>
              <td className="px-4 py-3 text-slate-900">{appointment.patientName}</td>
              <td className="px-4 py-3 text-slate-600">{formatDateTimeLabel(appointment.startAt)}</td>
              <td className="px-4 py-3">
                <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE_STYLES[appointment.status] ?? "bg-slate-100 text-slate-600"}`}>
                  {fr.appointments.status[appointment.status]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
