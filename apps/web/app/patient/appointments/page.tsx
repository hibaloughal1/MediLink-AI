"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useRequirePatient } from "@/lib/use-require-patient";
import { AppointmentCard } from "@/components/AppointmentCard";
import { StatusMessage } from "@/components/StatusMessage";
import type { PaginatedAppointments } from "@/lib/types";
import fr from "@/locales/fr";

export default function MyAppointmentsPage() {
  const { isReady } = useRequirePatient();

  const [data, setData] = useState<PaginatedAppointments | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<PaginatedAppointments>("/api/appointments/me?limit=100");
      setData(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fr.common.genericError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isReady) {
      load();
    }
  }, [isReady, load]);

  async function handleCancel(id: string) {
    if (!window.confirm(fr.appointments.cancelConfirm)) return;
    setCancellingId(id);
    setFeedback(null);
    try {
      await apiFetch(`/api/appointments/${id}/cancel`, { method: "PATCH" });
      setFeedback(fr.appointments.cancelSuccess);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fr.common.genericError);
    } finally {
      setCancellingId(null);
    }
  }

  if (!isReady) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <StatusMessage type="loading" message={fr.common.loading} />
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-900">{fr.appointments.title}</h1>

      {feedback && <StatusMessage type="success" message={feedback} />}
      {loading && <StatusMessage type="loading" message={fr.common.loading} />}
      {!loading && error && <StatusMessage type="error" message={error} />}
      {!loading && !error && data && data.appointments.length === 0 && (
        <StatusMessage type="empty" message={fr.appointments.empty} />
      )}

      {!loading && !error && data && data.appointments.length > 0 && (
        <div className="flex flex-col gap-3">
          {data.appointments.map((appointment) => (
            <AppointmentCard
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
