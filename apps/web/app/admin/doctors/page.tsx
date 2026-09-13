"use client";

import { useCallback, useEffect, useState } from "react";
import { useRequireAdmin } from "@/lib/use-require-admin";
import { apiFetch, ApiError } from "@/lib/api-client";
import { AdminDoctorsTable } from "@/components/AdminDoctorsTable";
import { StatusMessage } from "@/components/StatusMessage";
import type { DetailedDoctor, PaginatedAdminDoctors, VerificationStatus } from "@/lib/types";
import fr from "@/locales/fr";

const PAGE_SIZE = 100;
const FILTERS: (VerificationStatus | "ALL")[] = ["ALL", "PENDING", "VERIFIED", "REJECTED", "SUSPENDED"];

export default function AdminDoctorsPage() {
  const { isReady } = useRequireAdmin();

  const [filter, setFilter] = useState<VerificationStatus | "ALL">("ALL");
  const [doctors, setDoctors] = useState<DetailedDoctor[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = filter === "ALL" ? "" : `&status=${filter}`;
      const data = await apiFetch<PaginatedAdminDoctors>(`/api/admin/doctors?limit=${PAGE_SIZE}${query}`);
      setDoctors(data.doctors);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fr.common.genericError);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (isReady) load();
  }, [isReady, load]);

  async function runAction(id: string, action: "verify" | "reject" | "suspend", successMessage: string) {
    setError(null);
    setNotice(null);
    setPendingId(id);
    try {
      await apiFetch(`/api/admin/doctors/${id}/${action}`, { method: "PATCH" });
      setNotice(successMessage);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fr.common.genericError);
    } finally {
      setPendingId(null);
    }
  }

  const copy = fr.adminDashboard.doctorVerification;

  function handleVerify(id: string) {
    runAction(id, "verify", copy.verifySuccess);
  }

  function handleReject(id: string) {
    if (!window.confirm(copy.rejectConfirm)) return;
    runAction(id, "reject", copy.rejectSuccess);
  }

  function handleSuspend(id: string) {
    if (!window.confirm(copy.suspendConfirm)) return;
    runAction(id, "suspend", copy.suspendSuccess);
  }

  if (!isReady || loading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <StatusMessage type="loading" message={fr.common.loading} />
      </main>
    );
  }

  const isPartial = total > doctors.length;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-900">{copy.title}</h1>

      {error && <StatusMessage type="error" message={error} />}
      {notice && <StatusMessage type="success" message={notice} />}
      {isPartial && (
        <StatusMessage
          type="info"
          message={copy.paginationNotice.replace("{count}", String(doctors.length)).replace("{total}", String(total))}
        />
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              filter === value ? "bg-blue-700 text-white" : "border border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {value === "ALL" ? copy.filterAll : copy.label[value]}
          </button>
        ))}
      </div>

      <AdminDoctorsTable
        doctors={doctors}
        onVerify={handleVerify}
        onReject={handleReject}
        onSuspend={handleSuspend}
        pendingId={pendingId}
      />
    </main>
  );
}
