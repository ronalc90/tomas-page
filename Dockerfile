# syntax=docker/dockerfile:1

# ---------- 1. Compilar web y API ----------
FROM node:22-alpine AS build
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---------- 2. Solo las dependencias de producción de la API ----------
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev --workspace @tomas/api --ignore-scripts --no-audit --no-fund

# ---------- 3. Imagen final ----------
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/drizzle ./apps/api/drizzle
COPY --from=build /app/apps/web/dist ./apps/web/dist
# Los ejercicios SQL se califican con sql.js (su .wasm viene en node_modules/sql.js/dist, una
# dependencia de producción de la API) sobre la base de práctica tienda.sql.
COPY --from=build /app/packages/shared/src/data/tienda.sql ./packages/shared/src/data/tienda.sql
COPY package.json VERSION ./
RUN test -f node_modules/sql.js/dist/sql-wasm.wasm && test -f apps/api/dist/sql-worker.mjs
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
