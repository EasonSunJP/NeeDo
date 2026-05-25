FROM node:22-bookworm-slim AS deps

WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "const port=process.env.PORT||3100; const prefix=process.env.API_PREFIX||'/api/v1'; fetch('http://127.0.0.1:'+port+prefix+'/health').then((r)=>{if(!r.ok) process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
