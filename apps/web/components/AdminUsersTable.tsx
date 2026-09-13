"use client";

import { UserStatusBadge } from "@/components/UserStatusBadge";
import { StatusMessage } from "@/components/StatusMessage";
import type { AuthUser } from "@/lib/types";
import fr from "@/locales/fr";

type AdminUsersTableProps = {
  users: AuthUser[];
  currentUserId: string;
  onSuspend: (id: string) => void;
  onReactivate: (id: string) => void;
  pendingId: string | null;
};

/**
 * Table de gestion des comptes utilisateurs : ne permet de changer QUE
 * `status` (ACTIVE/SUSPENDED), jamais le rôle. La ligne de l'admin courant
 * et toute ligne ADMIN désactivent explicitement l'action de suspension —
 * en cohérence préventive avec les règles déjà appliquées côté serveur
 * (403 sur auto-suspension et sur la suspension d'un autre ADMIN), qui
 * restent la seule vraie protection.
 */
export function AdminUsersTable({ users, currentUserId, onSuspend, onReactivate, pendingId }: AdminUsersTableProps) {
  const copy = fr.adminDashboard.users;

  if (users.length === 0) {
    return <StatusMessage type="empty" message={copy.empty} />;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Utilisateur</th>
            <th className="px-4 py-3">{copy.columnRole}</th>
            <th className="px-4 py-3">{copy.columnAccountStatus}</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {users.map((user) => {
            const busy = pendingId === user.id;
            const isSelf = user.id === currentUserId;
            const isAdmin = user.role === "ADMIN";

            return (
              <tr key={user.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </td>
                <td className="px-4 py-3 text-slate-700">{user.role}</td>
                <td className="px-4 py-3">
                  <UserStatusBadge status={user.status} />
                </td>
                <td className="px-4 py-3">
                  {isSelf ? (
                    <p className="text-xs text-slate-400">{copy.selfRowNotice}</p>
                  ) : user.status === "ACTIVE" ? (
                    isAdmin ? (
                      <p className="text-xs text-slate-400">{copy.adminRowNotice}</p>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onSuspend(user.id)}
                        className="text-sm font-medium text-red-700 hover:underline disabled:opacity-50"
                      >
                        {copy.suspendAction}
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onReactivate(user.id)}
                      className="text-sm font-medium text-green-700 hover:underline disabled:opacity-50"
                    >
                      {copy.reactivateAction}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
