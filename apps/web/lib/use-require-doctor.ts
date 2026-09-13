"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/auth-context";

/**
 * Garde de route côté interface pour les pages médecin authentifiées.
 * Ce n'est PAS une barrière de sécurité (même principe que
 * `useRequirePatient`) : la protection réelle reste entièrement côté
 * serveur (RBAC + ownership déjà appliqués par l'API sur toutes les routes
 * `/api/doctors/me/*`).
 */
export function useRequireDoctor() {
  const { user, status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (status === "authenticated" && user && user.role !== "DOCTOR") {
      router.replace("/?notDoctor=1");
    }
  }, [status, user, router, pathname]);

  const isReady = status === "authenticated" && user?.role === "DOCTOR";
  return { user, status, isReady };
}
