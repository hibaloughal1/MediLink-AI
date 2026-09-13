"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { PaginatedNotifications } from "@/lib/types";
import fr from "@/locales/fr";

/**
 * Lien "Notifications" avec badge de non-lus, visible pour tout utilisateur
 * authentifié (PATIENT/DOCTOR/ADMIN). Se recharge à chaque navigation
 * (dépendance sur `usePathname`) plutôt que via un intervalle ou un
 * websocket — volontairement hors périmètre de l'étape 14 (pas de push
 * temps réel), cohérent avec le reste de l'app qui est 100% fetch-on-mount.
 */
export function NotificationBell() {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiFetch<PaginatedNotifications>("/api/notifications/me?unreadOnly=true&limit=1")
      .then((data) => {
        if (!cancelled) setUnreadCount(data.total);
      })
      .catch(() => {
        if (!cancelled) setUnreadCount(null);
      });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <Link href="/notifications" className="relative text-slate-700 hover:text-blue-700">
      {fr.notifications.bellLabel}
      {unreadCount !== null && unreadCount > 0 && (
        <span
          data-testid="notification-unread-badge"
          className="ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-medium text-white"
        >
          {unreadCount}
        </span>
      )}
    </Link>
  );
}
