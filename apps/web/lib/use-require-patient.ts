"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/auth-context";

/**
 * Garde de route côté interface pour les pages patient authentifiées.
 * Ce n'est PAS une barrière de sécurité : la protection réelle reste
 * entièrement côté serveur (RBAC + ownership déjà appliqués par l'API).
 * Ce hook n'a qu'un rôle d'UX (éviter d'afficher une page vide/erreur brute
 * à un visiteur non connecté ou à un compte DOCTOR/ADMIN).
 */
export function useRequirePatient() {
  const { user, status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (status === "authenticated" && user && user.role !== "PATIENT") {
      router.replace("/?notPatient=1");
    }
  }, [status, user, router, pathname]);

  const isReady = status === "authenticated" && user?.role === "PATIENT";
  return { user, status, isReady };
}
