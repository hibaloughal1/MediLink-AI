"use client";

import { useCallback, useEffect, useState } from "react";
import { useRequireAdmin } from "@/lib/use-require-admin";
import { apiFetch, ApiError } from "@/lib/api-client";
import { AdminUsersTable } from "@/components/AdminUsersTable";
import { StatusMessage } from "@/components/StatusMessage";
import type { AuthUser, PaginatedAdminUsers, Role } from "@/lib/types";
import fr from "@/locales/fr";

const PAGE_SIZE = 100;
const ROLES: (Role | "ALL")[] = ["ALL", "PATIENT", "DOCTOR", "ADMIN"];
const STATUSES: ("ACTIVE" | "SUSPENDED" | "ALL")[] = ["ALL", "ACTIVE", "SUSPENDED"];

export default function AdminUsersPage() {
  const { isReady, user: currentUser } = useRequireAdmin();

  const [roleFilter, setRoleFilter] = useState<Role | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "SUSPENDED" | "ALL">("ALL");
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
      if (roleFilter !== "ALL") params.set("role", roleFilter);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      const data = await apiFetch<PaginatedAdminUsers>(`/api/users?${params.toString()}`);
      setUsers(data.users);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fr.common.genericError);
    } finally {
      setLoading(false);
    }
  }, [roleFilter, statusFilter]);

  useEffect(() => {
    if (isReady) load();
  }, [isReady, load]);

  async function runAction(id: string, action: "suspend" | "reactivate", successMessage: string) {
    setError(null);
    setNotice(null);
    setPendingId(id);
    try {
      await apiFetch(`/api/admin/users/${id}/${action}`, { method: "PATCH" });
      setNotice(successMessage);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fr.common.genericError);
    } finally {
      setPendingId(null);
    }
  }

  const copy = fr.adminDashboard.users;

  function handleSuspend(id: string) {
    if (!window.confirm(copy.suspendConfirm)) return;
    runAction(id, "suspend", copy.suspendSuccess);
  }

  function handleReactivate(id: string) {
    if (!window.confirm(copy.reactivateConfirm)) return;
    runAction(id, "reactivate", copy.reactivateSuccess);
  }

  if (!isReady || loading || !currentUser) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <StatusMessage type="loading" message={fr.common.loading} />
      </main>
    );
  }

  const isPartial = total > users.length;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-900">{copy.title}</h1>

      {error && <StatusMessage type="error" message={error} />}
      {notice && <StatusMessage type="success" message={notice} />}
      {isPartial && (
        <StatusMessage
          type="info"
          message={copy.paginationNotice.replace("{count}", String(users.length)).replace("{total}", String(total))}
        />
      )}

      <div className="flex flex-wrap gap-3">
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as Role | "ALL")}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          aria-label={copy.columnRole}
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {role === "ALL" ? copy.filterAllRoles : role}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "ACTIVE" | "SUSPENDED" | "ALL")}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          aria-label={copy.columnAccountStatus}
        >
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status === "ALL" ? copy.filterAllStatuses : fr.adminDashboard.users.accountStatus[status]}
            </option>
          ))}
        </select>
      </div>

      <AdminUsersTable
        users={users}
        currentUserId={currentUser.id}
        onSuspend={handleSuspend}
        onReactivate={handleReactivate}
        pendingId={pendingId}
      />
    </main>
  );
}
