# --- Build: Frontend bauen -------------------------------------------------
FROM oven/bun:1.4 AS build
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY packages/content/package.json packages/content/
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# --- Runtime: nur Server, Content und gebautes Frontend -------------------
FROM oven/bun:1.4-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    ROOM_TTL_MINUTES=120

COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY packages/content/package.json packages/content/
RUN bun install --frozen-lockfile --production

COPY apps/server/src apps/server/src
COPY packages/shared/src packages/shared/src
COPY packages/content/src packages/content/src
COPY packages/content/categories packages/content/categories
COPY --from=build /app/apps/web/dist apps/web/dist

USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD bun -e "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["bun", "run", "apps/server/src/index.ts"]
