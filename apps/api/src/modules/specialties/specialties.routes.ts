import type { FastifyInstance } from "fastify";

export default async function specialtiesRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    const specialties = await app.prisma.specialty.findMany({ orderBy: { name: "asc" } });
    return { specialties };
  });
}
