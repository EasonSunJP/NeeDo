FROM node:22-bookworm-slim AS all-deps

WORKDIR /app
COPY backend/package*.json ./
COPY backend/prisma ./prisma
RUN npm ci && npx prisma generate

FROM all-deps AS migration

COPY backend/dist ./dist
CMD ["npm", "run", "prisma:migrate:deploy"]

FROM all-deps AS production-deps

RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-deps --chown=node:node /app/package*.json ./
COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node backend/dist ./dist
COPY --chown=node:node backend/prisma ./prisma
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]

