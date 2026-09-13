"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch, ApiError, refreshAccessToken } from "@/lib/api-client";
import { clearAccessToken, setAccessToken } from "@/lib/token-store";
import type { AuthUser } from "@/lib/types";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export type RegisterInput = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const loadProfile = useCallback(async () => {
    const { user: me } = await apiFetch<{ user: AuthUser }>("/api/users/me");
    setUser(me);
    setStatus("authenticated");
  }, []);

  // Rafraîchissement silencieux au chargement : le cookie httpOnly de
  // refresh token (s'il existe et est valide) permet de restaurer la
  // session sans jamais avoir stocké l'access token entre deux visites.
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        // Passe par `refreshAccessToken` (et sa déduplication par promesse
        // partagée) plutôt que d'appeler `/api/auth/refresh` directement :
        // en mode strict de React (dev), cet effet est invoqué deux fois de
        // suite au montage, ce qui déclenchait deux appels de refresh
        // concurrents sur le même cookie à usage unique — le second échouait
        // systématiquement (token déjà tourné par le premier) et effaçait la
        // session tout juste restaurée par le premier.
        const refreshed = await refreshAccessToken();
        if (cancelled) return;
        if (!refreshed) {
          throw new Error("Le rafraîchissement de session a échoué.");
        }
        await loadProfile();
      } catch {
        if (cancelled) return;
        clearAccessToken();
        setUser(null);
        setStatus("unauthenticated");
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<{ accessToken: string; user: AuthUser }>(
      "/api/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
      { skipAuthRetry: true },
    );
    setAccessToken(data.accessToken);
    setUser(data.user);
    setStatus("authenticated");
  }, []);

  const register = useCallback(
    async (input: RegisterInput) => {
      await apiFetch(
        "/api/auth/register",
        { method: "POST", body: JSON.stringify({ ...input, role: "PATIENT" }) },
        { skipAuthRetry: true },
      );
      // L'inscription ne renvoie pas de session (cf. apps/api) : on
      // enchaîne avec une connexion pour une UX "inscrit = connecté".
      await login(input.email, input.password);
    },
    [login],
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" }, { skipAuthRetry: true });
    } catch {
      // Même si l'appel échoue (session déjà expirée côté serveur), on
      // efface la session locale : l'utilisateur doit pouvoir "se
      // déconnecter" dans tous les cas côté interface.
    } finally {
      clearAccessToken();
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      await loadProfile();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearAccessToken();
        setUser(null);
        setStatus("unauthenticated");
        return;
      }
      throw error;
    }
  }, [loadProfile]);

  const value = useMemo(
    () => ({ user, status, login, register, logout, refreshProfile }),
    [user, status, login, register, logout, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth doit être utilisé à l'intérieur de <AuthProvider>.");
  }
  return ctx;
}
