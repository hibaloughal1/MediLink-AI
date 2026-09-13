// Stocke l'access token STRICTEMENT en mémoire process/onglet (variable de
// module), jamais dans localStorage/sessionStorage : un token persistant
// serait exfiltrable par une faille XSS. La session survit à un
// rafraîchissement de page uniquement via le refresh silencieux (cookie
// httpOnly de refresh token, jamais lu ni manipulé ici).
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
}
