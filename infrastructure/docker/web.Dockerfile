# Image de développement pour apps/web (Next.js)
# node:22-alpine pour rester cohérent avec le reste du monorepo (voir
# infrastructure/docker/api.Dockerfile et engines.node du package.json racine).
FROM node:22-alpine

WORKDIR /workspace

COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json

RUN npm install

COPY apps/web apps/web

WORKDIR /workspace/apps/web

EXPOSE 3000

CMD ["npm", "run", "dev"]
