import type { NextConfig } from "next";

// CSP minimale (étape 16), volontairement permissive sur script-src/style-src
// ('unsafe-inline' + 'unsafe-eval') : Next.js (dev ET build standard, sans
// nonces) a besoin des deux pour fonctionner normalement (React Refresh en
// dev, certains styles/scripts injectés en prod) — une CSP stricte à base de
// nonces est notée comme amélioration future (docs/security/README.md),
// pas introduite ici sans avoir vérifié qu'elle ne casse aucune page.
// `connect-src` inclut l'URL de l'API (le frontend y fait des requêtes
// cross-origin depuis le navigateur) en plus de 'self'.
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  `connect-src 'self' ${apiUrl}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // HSTS gagé sur NODE_ENV plutôt que sur le protocole de la requête (Next
  // ne l'expose pas à ce niveau de configuration, contrairement à
  // apps/api) : la documentation de déploiement (docs/deployment/README.md)
  // impose un reverse proxy HTTPS devant `web` en production, donc
  // NODE_ENV=production implique HTTPS réel dans ce projet.
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
