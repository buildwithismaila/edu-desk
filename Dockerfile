# syntax=docker/dockerfile:1
# Edu Desk production image (docs/deploy.md).
#   build   — the full project with dev dependencies: builds the app, and doubles as the "tools" image for
#             migrations (pnpm db:migrate) and creating schools (pnpm school:create)
#   runtime — just the built server (.output), run as the unprivileged node user

FROM node:24-slim AS build
RUN npm install --global pnpm@11.5.0
WORKDIR /app
# Download dependencies first (cached until the lockfile changes); install once the sources are there,
# because postinstall runs `nuxt prepare`
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile && pnpm build

FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/.output ./.output
# Uploads (logos, student photos) live in /app/.data/uploads: mount a volume on /app/.data
RUN mkdir -p .data/uploads && chown -R node:node .data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/_health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", ".output/server/index.mjs"]
