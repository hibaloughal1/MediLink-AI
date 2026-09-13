"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRequireAdmin } from "@/lib/use-require-admin";
import { apiFetch, ApiError } from "@/lib/api-client";
import { StatusMessage } from "@/components/StatusMessage";
import type { PaginatedAdminDoctors, PaginatedAdminUsers, PaginatedAdminAppointments } from "@/lib/types";
import fr from "@/locales/fr";

type Counts = { pendingDoctors: number; totalUsers: number; totalAppointments: number };

export default function AdminOverviewPage() {
  const { isReady } = useRequireAdmin();

  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // `limit=1`/`pageSize=1` : seul le champ `total` (calculé côté API par
      // un COUNT indépendant de la pagination) nous intéresse ici.
      const [pendingDoctors, users, appointments] = await Promise.all([
        apiFetch<PaginatedAdminDoctors>("/api/admin/doctors?status=PENDING&limit=1"),
        apiFetch<PaginatedAdminUsers>("/api/users?pageSize=1"),
        apiFetch<PaginatedAdminAppointments>("/api/admin/appointments?limit=1"),
      ]);
      setCounts({
        pendingDoctors: pendingDoctors.total,
        totalUsers: users.total,
        totalAppointments: appointments.total,
      });
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
      <main className="mx-auto max-w-3xl px-4 py-8">
        <StatusMessage type="loading" message={fr.common.loading} />
      </main>
    );
  }

  const copy = fr.adminDashboard;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-900">{copy.dashboardTitle}</h1>

      {error && <StatusMessage type="error" message={error} />}

      {counts && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-2xl font-semibold text-slate-900">{counts.pendingDoctors}</p>
            <p className="text-sm text-slate-500">{copy.overview.pendingDoctors}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-2xl font-semibold text-slate-900">{counts.totalUsers}</p>
            <p className="text-sm text-slate-500">{copy.overview.totalUsers}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-2xl font-semibold text-slate-900">{counts.totalAppointments}</p>
            <p className="text-sm text-slate-500">{copy.overview.totalAppointments}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link href="/admin/doctors" className="rounded-lg border border-slate-200 bg-white p-4 text-center text-sm font-medium text-slate-700 shadow-sm hover:border-blue-300">
          {copy.nav.doctors}
        </Link>
        <Link href="/admin/users" className="rounded-lg border border-slate-200 bg-white p-4 text-center text-sm font-medium text-slate-700 shadow-sm hover:border-blue-300">
          {copy.nav.users}
        </Link>
        <Link href="/admin/appointments" className="rounded-lg border border-slate-200 bg-white p-4 text-center text-sm font-medium text-slate-700 shadow-sm hover:border-blue-300">
          {copy.nav.appointments}
        </Link>
      </div>
    </main>
  );
}
