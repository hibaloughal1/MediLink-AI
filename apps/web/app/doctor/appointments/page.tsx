"use client";

import { useCallback, useEffect, useState } from "react";
import { useRequireDoctor } from "@/lib/use-require-doctor";
import { apiFetch, ApiError } from "@/lib/api-client";
import { DoctorAppointmentCard } from "@/components/DoctorAppointmentCard";
import { StatusMessage } from "@/components/StatusMessage";
import type { DoctorAppointment, PaginatedDoctorAppointments } from "@/lib/types";
import fr from "@/locales/fr";

// Le backend pagine `/me/appointments`. `limit=100` n'est qu'une taille de
// page pratique, jamais une garantie que tout l'agenda tient sur une seule
// page : on compare toujours `total` au nombre réellement chargé et on
// prévient l'utilisateur plutôt que de présenter silencieusement un
// sous-ensemble comme l'agenda complet. Un vrai filtrage par date côté API
// serait nécessaire pour un agenda paginé correct — non implémenté ici
// (hors périmètre de cette étape).
const PAGE_SIZE = 100;

export default function DoctorAppointmentsPage() {
  const { isReady } = useRequireDoctor();

  const [appointments, setAppointments] = useState<DoctorAppointment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<PaginatedDoctorAppointments>(`/api/doctors/me/appointments?limit=${PAGE_SIZE}`);
      setAppointments(data.appointments);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fr.common.genericError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isReady) load();
  }, [isReady, load]);

  async function handleCancel(id: string) {
    const copy = fr.doctorDashboard.appointments;
    if (!window.confirm(fr.appointments.cancelConfirm)) return;
    setCancellingId(id);
    setError(null);
    setNotice(null);
    try {
      await apiFetch<{ appointment: DoctorAppointment }>(`/api/doctors/me/appointments/${id}/cancel`, {
        method: "PATCH",
      });
      setNotice(copy.cancelSuccess);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fr.common.genericError);
    } finally {
      setCancellingId(null);
    }
  }

  if (!isReady || loading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <StatusMessage type="loading" message={fr.common.loading} />
      </main>
    );
  }

  const copy = fr.doctorDashboard.appointments;
  const isPartial = total > appointments.length;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-900">{copy.title}</h1>

      {error && <StatusMessage type="error" message={error} />}
      {notice && <StatusMessage type="success" message={notice} />}
      {isPartial && (
        <StatusMessage
          type="info"
          message={copy.paginationNotice
            .replace("{count}", String(appointments.length))
            .replace("{total}", String(total))}
        />
      )}

      {appointments.length === 0 ? (
        <StatusMessage type="empty" message={copy.empty} />
      ) : (
        <div className="flex flex-col gap-3">
          {appointments.map((appointment) => (
            <DoctorAppointmentCard
              key={appointment.id}
              appointment={appointment}
              onCancel={handleCancel}
              cancelling={cancellingId === appointment.id}
            />
          ))}
        </div>
      )}
    </main>
  );
}
