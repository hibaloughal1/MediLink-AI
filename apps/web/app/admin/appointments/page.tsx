"use client";

import { useCallback, useEffect, useState } from "react";
import { useRequireAdmin } from "@/lib/use-require-admin";
import { apiFetch, ApiError } from "@/lib/api-client";
import { AdminAppointmentsTable } from "@/components/AdminAppointmentsTable";
import { StatusMessage } from "@/components/StatusMessage";
import type { AdminAppointment, PaginatedAdminAppointments } from "@/lib/types";
import fr from "@/locales/fr";

// Cohérent avec la même limitation déjà documentée pour l'agenda médecin
// (étape 12) : `limit=100` n'est qu'une taille de page, jamais une garantie
// que tout l'historique est chargé — `total` reste la seule source de
// vérité, comparée explicitement au nombre réellement chargé.
const PAGE_SIZE = 100;

export default function AdminAppointmentsPage() {
  const { isReady } = useRequireAdmin();

  const [appointments, setAppointments] = useState<AdminAppointment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<PaginatedAdminAppointments>(`/api/admin/appointments?limit=${PAGE_SIZE}`);
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

  if (!isReady || loading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <StatusMessage type="loading" message={fr.common.loading} />
      </main>
    );
  }

  const copy = fr.adminDashboard.appointments;
  const isPartial = total > appointments.length;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-900">{copy.title}</h1>

      {error && <StatusMessage type="error" message={error} />}
      <StatusMessage type="info" message={copy.readOnlyNotice} />
      {isPartial && (
        <StatusMessage
          type="info"
          message={copy.paginationNotice.replace("{count}", String(appointments.length)).replace("{total}", String(total))}
        />
      )}

      <AdminAppointmentsTable appointments={appointments} />
    </main>
  );
}
