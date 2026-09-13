# Image de développement pour apps/api (Fastify + TypeScript)
# node:22-alpine requis par une dépendance transitive (cookie@2.0.1 via
# @fastify/cookie, engine >= 22) ; évite l'avertissement EBADENGINE observé
# avec node:20-alpine à l'étape 7.
FROM node:22-alpine

# Requis par le moteur Prisma sur Alpine (détection correcte d'OpenSSL).
RUN apk add --no-cache openssl

WORKDIR /workspace

COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json

RUN npm install

COPY apps/api apps/api
COPY tsconfig.base.json tsconfig.base.json

WORKDIR /workspace/apps/api

RUN npx prisma generate

EXPOSE 4000

CMD ["npx", "tsx", "watch", "src/server.ts"]
