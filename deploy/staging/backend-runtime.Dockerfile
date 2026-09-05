FROM nginx:1.27-alpine AS trusted-certificates

FROM node:22-bookworm-slim AS all-deps

WORKDIR /app
COPY --from=trusted-certificates /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY backend/package*.json ./
COPY backend/prisma ./prisma
COPY backend/prisma.config.ts ./prisma.config.ts
RUN npm ci && npx prisma generate

FROM all-deps AS migration

COPY backend/dist ./dist
CMD ["npm", "run", "prisma:migrate:deploy"]

FROM all-deps AS production-deps

RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
COPY --from=trusted-certificates /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=production-deps --chown=node:node /app/package*.json ./
COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node backend/dist ./dist
COPY --chown=node:node backend/prisma ./prisma
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
