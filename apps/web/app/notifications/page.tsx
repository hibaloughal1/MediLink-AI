"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { apiFetch, ApiError } from "@/lib/api-client";
import { StatusMessage } from "@/components/StatusMessage";
import { formatDateTimeLabel } from "@/lib/format";
import type { AppNotification, PaginatedNotifications } from "@/lib/types";
import fr from "@/locales/fr";

// Cohérent avec la même limitation déjà documentée pour l'agenda médecin et
// la supervision admin (étapes 12/13) : `limit=100` n'est qu'une taille de
// page, jamais une garantie que tout l'historique est chargé — `total`
// reste comparé explicitement au nombre réellement chargé.
const PAGE_SIZE = 100;

export default function NotificationsPage() {
  const { user, status } = useAuth();
  const router = useRouter();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent("/notifications")}`);
    }
  }, [status, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<PaginatedNotifications>(`/api/notifications/me?limit=${PAGE_SIZE}`);
      setNotifications(data.notifications);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fr.common.genericError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") load();
  }, [status, load]);

  async function handleMarkRead(id: string) {
    setError(null);
    try {
      await apiFetch(`/api/notifications/me/${id}/read`, { method: "PATCH" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fr.common.genericError);
    }
  }

  async function handleMarkAllRead() {
    setError(null);
    setNotice(null);
    try {
      await apiFetch("/api/notifications/me/read-all", { method: "PATCH" });
      setNotice(fr.notifications.markAllReadSuccess);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fr.common.genericError);
    }
  }

  if (status !== "authenticated" || loading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <StatusMessage type="loading" message={fr.common.loading} />
      </main>
    );
  }

  const copy = fr.notifications;
  const isPartial = total > notifications.length;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">{copy.pageTitle}</h1>
        {notifications.length > 0 && (
          <button type="button" onClick={handleMarkAllRead} className="text-sm font-medium text-blue-700 hover:underline">
            {copy.markAllRead}
          </button>
        )}
      </div>

      {error && <StatusMessage type="error" message={error} />}
      {notice && <StatusMessage type="success" message={notice} />}
      {isPartial && (
        <StatusMessage
          type="info"
          message={copy.paginationNotice.replace("{count}", String(notifications.length)).replace("{total}", String(total))}
        />
      )}

      {notifications.length === 0 ? (
        <StatusMessage type="empty" message={copy.empty} />
      ) : (
        <ul className="flex flex-col gap-3">
          {notifications.map((notification) => {
            const counterpart =
              user?.role === "DOCTOR"
                ? `${copy.counterpartPatientPrefix} ${notification.patientName}`
                : `${copy.counterpartDoctorPrefix} ${notification.doctorName}`;

            return (
              <li
                key={notification.id}
                className={`flex flex-col gap-1 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between ${
                  notification.readAt ? "border-slate-200 bg-white" : "border-blue-200 bg-blue-50"
                }`}
              >
                <div>
                  <p className="font-medium text-slate-900">{copy.type[notification.type]}</p>
                  <p className="text-sm text-slate-600">
                    {counterpart} — {formatDateTimeLabel(notification.appointmentStartAt)}
                  </p>
                </div>
                {!notification.readAt && (
                  <button
                    type="button"
                    onClick={() => handleMarkRead(notification.id)}
                    className="self-start text-sm font-medium text-blue-700 hover:underline sm:self-center"
                  >
                    {copy.markRead}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
