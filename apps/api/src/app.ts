import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";

import prismaPlugin from "./plugins/prisma.js";
import authPlugin from "./plugins/auth.js";
import errorHandlerPlugin from "./plugins/error-handler.js";
import securityHeadersPlugin from "./plugins/security-headers.js";
import emailTransportPlugin from "./plugins/email-transport.js";
import authRoutes from "./modules/auth/auth.routes.js";
import usersRoutes from "./modules/users/users.routes.js";
import usersAdminRoutes from "./modules/users/users.admin.routes.js";
import doctorsRoutes from "./modules/doctors/doctors.routes.js";
import doctorsAdminRoutes from "./modules/doctors/doctors.admin.routes.js";
import specialtiesRoutes from "./modules/specialties/specialties.routes.js";
import citiesRoutes from "./modules/cities/cities.routes.js";
import availabilityRoutes from "./modules/availability/availability.routes.js";
import appointmentsRoutes from "./modules/appointments/appointments.routes.js";
import doctorAppointmentsRoutes from "./modules/appointments/appointments.doctor.routes.js";
import adminAppointmentsRoutes from "./modules/appointments/appointments.admin.routes.js";
import notificationsRoutes from "./modules/notifications/notifications.routes.js";
import { runReminderSweep } from "./modules/notifications/notifications.service.js";

// Chemins pino redirigés vers "[REDACTED]" avant toute écriture de log
// (étape 16) : aucun jeton d'accès, cookie de session ou refresh token ne
// doit pouvoir apparaître dans les logs, y compris si un code futur venait
// à logger `request`/`reply` directement (le sérialiseur par défaut de
// Fastify n'inclut pas les en-têtes aujourd'hui, mais cette configuration
// ne dépend pas de ce détail d'implémentation pour rester sûre). Exporté
// pour être testable indépendamment (voir tests/logger-redaction.test.ts).
export const LOG_REDACT_PATHS = ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'];

export async function buildServer(loggerStream?: NodeJS.WritableStream) {
  const app = Fastify({
    logger: {
      redact: { paths: LOG_REDACT_PATHS, censor: "[REDACTED]" },
      // Sérialiseurs personnalisés : le défaut de Fastify n'inclut PAS les
      // en-têtes dans les logs, ce qui rendrait la redaction ci-dessus
      // inerte (rien à masquer). En incluant explicitement `headers`
      // (utile pour le débogage : user-agent, content-type, etc.) sur la
      // requête entrante et sortante, la redaction devient réellement
      // effective plutôt que symbolique.
      serializers: {
        req(request) {
          return { method: request.method, url: request.url, hostname: request.hostname, remoteAddress: request.ip, headers: request.headers };
        },
        res(reply) {
          return { statusCode: reply.statusCode, headers: reply.getHeaders?.() ?? {} };
        },
      },
      ...(loggerStream ? { stream: loggerStream } : {}),
    },
  });

  // `await` sur ces deux enregistrements : sans cela, `@fastify/cors` et
  // `@fastify/rate-limit` enregistrés en parallèle (fire-and-forget, comme
  // c'était le cas avant l'étape 15) s'interfèrent silencieusement — le
  // rate-limit ne déclenche alors plus jamais de 429, quel que soit le
  // nombre de requêtes. Bug réel découvert en écrivant le premier test qui
  // exerçait vraiment le rate-limit (jusqu'ici désactivé sous
  // `NODE_ENV=test`, donc jamais vérifié). `buildServer` devient async pour
  // cette seule raison — tous les appelants (`server.ts`, les tests) sont
  // mis à jour en conséquence.
  //
  // `CORS_ORIGIN` (étape 16) : liste blanche explicite en production
  // (`https://medilink.example,https://www.medilink.example`), jamais un
  // domaine réel codé en dur ici. Sans cette variable (développement/tests
  // par défaut), on retombe sur `origin: true` (reflète l'origine de la
  // requête) — comportement historique, inchangé pour ne pas casser le
  // développement local. `credentials: true` reste nécessaire dans tous les
  // cas pour que le navigateur envoie le cookie de refresh token.
  const corsOriginEnv = process.env.CORS_ORIGIN?.trim();
  const corsOrigin = corsOriginEnv
    ? corsOriginEnv.split(",").map((origin) => origin.trim()).filter(Boolean)
    : true;

  await app.register(cors, {
    origin: corsOrigin,
    credentials: true, // requis pour que le navigateur envoie le cookie de refresh token
  });

  // Limite globale par défaut ; les routes sensibles (login/register)
  // définissent une limite plus stricte via `config.rateLimit`. Désactivé
  // en environnement de test : les suites de tests exécutent volontairement
  // beaucoup d'appels register/login en rafale sur une même "IP" simulée,
  // ce qui déclencherait des faux 429 sans rapport avec ce qui est testé.
  // Vérifié réellement par `tests/rate-limit.test.ts` (avec `NODE_ENV`
  // temporairement différent de "test", le temps de ce seul test).
  if (process.env.NODE_ENV !== "test") {
    await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });
  }

  app.register(errorHandlerPlugin);
  app.register(securityHeadersPlugin);
  app.register(prismaPlugin);
  app.register(authPlugin);
  app.register(emailTransportPlugin);

  // Liveness: confirme que le serveur Fastify répond.
  app.get("/health", async () => {
    return { status: "ok", service: "medilink-api" };
  });

  // Readiness: confirme que la connexion à PostgreSQL via Prisma fonctionne.
  app.get("/health/db", async (_request, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", database: "connected" };
    } catch (error) {
      app.log.error(error);
      return reply.status(503).send({ status: "error", database: "unreachable" });
    }
  });

  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(usersRoutes, { prefix: "/api/users" });
  app.register(usersAdminRoutes, { prefix: "/api/admin/users" });
  app.register(doctorsRoutes, { prefix: "/api/doctors" });
  app.register(availabilityRoutes, { prefix: "/api/doctors" });
  app.register(doctorsAdminRoutes, { prefix: "/api/admin/doctors" });
  app.register(specialtiesRoutes, { prefix: "/api/specialties" });
  app.register(citiesRoutes, { prefix: "/api/cities" });
  app.register(appointmentsRoutes, { prefix: "/api/appointments" });
  app.register(doctorAppointmentsRoutes, { prefix: "/api/doctors" });
  app.register(adminAppointmentsRoutes, { prefix: "/api/admin/appointments" });
  app.register(notificationsRoutes, { prefix: "/api/notifications" });

  // Scheduler de rappel de rendez-vous : in-process, pas de file d'attente
  // ni de cron externe. Désactivé sous test (comme le rate-limit) pour ne
  // jamais démarrer une tâche de fond vivante pendant la suite de tests —
  // le comportement du balayage est testé directement via
  // `runReminderSweep()`, indépendamment de ce minuteur.
  if (process.env.NODE_ENV !== "test") {
    // `addHook` doit être appelé avant que l'instance ne démarre à écouter
    // (Fastify l'interdit ensuite — FST_ERR_INSTANCE_ALREADY_LISTENING) :
    // le hook est donc enregistré ici, synchrone, tandis que la création du
    // minuteur lui-même attend `app.ready()` pour être sûr que
    // `app.prisma`/`app.emailTransport` sont bien décorés.
    let timer: NodeJS.Timeout | undefined;
    app.addHook("onClose", async () => {
      if (timer) clearInterval(timer);
    });
    app.ready(() => {
      const intervalMs = Number(process.env.REMINDER_CHECK_INTERVAL_MS ?? 15 * 60 * 1000);
      timer = setInterval(() => {
        runReminderSweep(app.prisma, app.emailTransport).catch((error) => {
          app.log.error(error, "Échec du balayage des rappels de rendez-vous.");
        });
      }, intervalMs);
    });
  }

  return app;
}
