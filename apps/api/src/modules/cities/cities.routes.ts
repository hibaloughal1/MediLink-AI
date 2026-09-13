import type { FastifyInstance } from "fastify";

export default async function citiesRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    const cities = await app.prisma.city.findMany({ orderBy: { name: "asc" } });
    return { cities };
  });
}
