import type { PatientAppointment } from "@/lib/types";
import { formatDateTimeLabel } from "@/lib/format";
import fr from "@/locales/fr";

const CANCELLABLE_STATUSES = new Set(["PENDING", "CONFIRMED"]);

const STATUS_BADGE_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-green-100 text-green-800",
  CANCELLED: "bg-slate-200 text-slate-600",
  COMPLETED: "bg-blue-100 text-blue-800",
  NO_SHOW: "bg-red-100 text-red-800",
};

type AppointmentCardProps = {
  appointment: PatientAppointment;
  onCancel: (id: string) => void;
  cancelling?: boolean;
};

export function AppointmentCard({ appointment, onCancel, cancelling }: AppointmentCardProps) {
  const isPast = new Date(appointment.startAt).getTime() <= Date.now();
  const canCancel = CANCELLABLE_STATUSES.has(appointment.status) && !isPast;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold text-slate-900">
          Dr {appointment.doctor.firstName} {appointment.doctor.lastName}
        </p>
        {appointment.doctor.specialties.length > 0 && (
          <p className="text-sm text-blue-700">{appointment.doctor.specialties.map((s) => s.name).join(", ")}</p>
        )}
        <p className="text-sm text-slate-600">{formatDateTimeLabel(appointment.startAt)}</p>
        {appointment.doctor.city && <p className="text-sm text-slate-500">{appointment.doctor.city.name}</p>}
      </div>

      <div className="flex items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE_STYLES[appointment.status] ?? "bg-slate-100 text-slate-600"}`}>
          {fr.appointments.status[appointment.status]}
        </span>
        {canCancel && (
          <button
            type="button"
            disabled={cancelling}
            onClick={() => onCancel(appointment.id)}
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {fr.appointments.cancelAction}
          </button>
        )}
      </div>
    </div>
  );
}
