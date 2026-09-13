import { pathToFileURL } from "node:url";
import { buildServer } from "./app.js";

async function start() {
  const app = await buildServer();
  // `PORT` (fourni automatiquement par Render, ou toute plateforme qui
  // assigne son propre port) est prioritaire s'il est présent ; `API_PORT`
  // reste le nom utilisé en local/Docker (docker-compose.yml,
  // docker-compose.prod.yml) ; 4000 le défaut historique si aucun des deux
  // n'est défini.
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);

  try {
    await app.listen({ port, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  start();
}
