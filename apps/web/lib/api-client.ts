import { clearAccessToken, getAccessToken, setAccessToken } from "./token-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type ApiFetchOptions = RequestInit & {
  /** Interne : empêche la tentative de refresh (utilisé pour l'appel de
   * refresh lui-même et pour la requête rejouée, afin qu'un seul refresh
   * ait lieu et qu'aucune boucle ne soit possible). */
  skipAuthRetry?: boolean;
};

let refreshPromise: Promise<boolean> | null = null;

/**
 * Rafraîchit l'access token via le cookie httpOnly de refresh token
 * (jamais lu/écrit directement ici — le navigateur l'envoie automatiquement
 * grâce à `credentials: "include"`). Dédupliqué : si plusieurs requêtes
 * échouent en 401 simultanément, un seul appel réseau de refresh est
 * effectué, les autres attendent la même promesse.
 */
export function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = apiFetch<{ accessToken: string }>(
      "/api/auth/refresh",
      { method: "POST" },
      { skipAuthRetry: true },
    )
      .then((data) => {
        setAccessToken(data.accessToken);
        return true;
      })
      .catch(() => {
        clearAccessToken();
        return false;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function apiFetch<T>(path: string, init: ApiFetchOptions = {}, extra: ApiFetchOptions = {}): Promise<T> {
  const { skipAuthRetry, ...fetchInit } = { ...init, ...extra };
  const token = getAccessToken();

  const headers = new Headers(fetchInit.headers);
  if (fetchInit.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...fetchInit,
    headers,
    // Nécessaire pour que le cookie httpOnly de refresh token voyage avec
    // les requêtes vers /api/auth/refresh et /api/auth/logout.
    credentials: "include",
  });

  if (response.status === 401 && !skipAuthRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      // Un seul essai supplémentaire : `skipAuthRetry: true` empêche toute
      // boucle si la requête rejouée échoue à nouveau en 401.
      return apiFetch<T>(path, init, { skipAuthRetry: true });
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && "message" in payload && typeof (payload as { message?: unknown }).message === "string"
        ? (payload as { message: string }).message
        : null) ?? `Erreur ${response.status}`;
    throw new ApiError(response.status, message, payload);
  }

  return payload as T;
}
