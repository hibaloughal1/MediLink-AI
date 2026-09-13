"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/auth-context";

/**
 * Garde de route côté interface pour les pages admin authentifiées.
 * Ce n'est PAS une barrière de sécurité (même principe que
 * `useRequirePatient`/`useRequireDoctor`) : la protection réelle reste
 * entièrement côté serveur (RBAC `app.authorize("ADMIN")` sur toutes les
 * routes `/api/admin/*`).
 */
export function useRequireAdmin() {
  const { user, status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (status === "authenticated" && user && user.role !== "ADMIN") {
      router.replace("/?notAdmin=1");
    }
  }, [status, user, router, pathname]);

  const isReady = status === "authenticated" && user?.role === "ADMIN";
  return { user, status, isReady };
}
