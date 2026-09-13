import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";

/**
 * En-têtes de sécurité minimaux (étape 16), ajoutés à la main plutôt que
 * via une dépendance dédiée (Helmet) : le besoin réel du MVP se résume à
 * deux en-têtes statiques + un en-tête conditionnel, ce qui ne justifie pas
 * une dépendance supplémentaire à maintenir.
 *
 *  - `X-Content-Type-Options: nosniff` : empêche le navigateur de deviner
 *    un type MIME différent de celui déclaré (protection contre certaines
 *    attaques XSS/exécution de contenu non prévu).
 *  - `Referrer-Policy: no-referrer` : n'expose jamais l'URL courante (qui
 *    peut contenir des paramètres de recherche) au site cible d'un lien.
 *  - `Strict-Transport-Security` : uniquement si la requête est réellement
 *    reçue en HTTPS (`request.protocol === "https"`) — jamais envoyé sur
 *    une requête HTTP simple (développement local), pour ne jamais annoncer
 *    à tort une garantie qui n'est pas respectée.
 */
export default fp(async function securityHeadersPlugin(app: FastifyInstance) {
  app.addHook("onSend", async (request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    if (request.protocol === "https") {
      reply.header("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    }
  });
});
