import fp from "fastify-plugin";
import nodemailer from "nodemailer";
import type { FastifyInstance } from "fastify";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

declare module "fastify" {
  interface FastifyInstance {
    emailTransport: EmailTransport;
  }
}

// Timeout raisonnable pour éviter qu'un serveur SMTP lent ou injoignable ne
// bloque une requête HTTP de réservation/annulation. L'envoi reste
// strictement best-effort : voir `notifications.service.ts`, qui ne laisse
// jamais une erreur ici remonter jusqu'à la réponse API.
const SMTP_TIMEOUT_MS = 5000;

/**
 * Transport "no-op" utilisé quand aucun SMTP n'est configuré (dev sans
 * Mailpit, CI, etc.) : ne fait aucun appel réseau et réussit toujours. Les
 * tests qui doivent vérifier le chemin d'échec injectent leur propre
 * transport factice via `app.emailTransport = ...` (décorateur Fastify,
 * réassignable comme `app.prisma`).
 */
function createNoopTransport(): EmailTransport {
  return {
    async send() {
      // Aucun SMTP configuré : rien à envoyer réellement. Documenté comme
      // comportement attendu en dev/CI sans Mailpit — voir README.
    },
  };
}

function createSmtpTransport(): EmailTransport {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });

  return {
    async send(message) {
      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? "no-reply@medilink.local",
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
    },
  };
}

/**
 * Décore l'instance Fastify avec un transport email choisi selon
 * l'environnement : réel (SMTP, ex. Mailpit en dev) si `SMTP_HOST` est
 * défini, sinon un no-op qui ne fait aucun appel réseau. Jamais de
 * branchement conditionnel dans le code appelant (`notifications.service.ts`) :
 * un seul point de décision, ici.
 */
export default fp(async function emailTransportPlugin(app: FastifyInstance) {
  const transport = process.env.SMTP_HOST ? createSmtpTransport() : createNoopTransport();
  app.decorate("emailTransport", transport);
});
