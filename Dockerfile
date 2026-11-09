# One image: the API, which also serves the built web app on the same port. Node 24 runs the
# TypeScript sources directly, so only the web app has a build step.
FROM node:24-alpine AS base
RUN npm install --global pnpm@12.16.1
WORKDIR /app
# Every workspace manifest, so the lockfile matches; only the needed projects get installed.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/extractor/package.json packages/extractor/
COPY packages/validators/package.json packages/validators/
COPY packages/datagen/package.json packages/datagen/
COPY eval/package.json eval/
COPY e2e/package.json e2e/

FROM base AS web
RUN --mount=type=cache,target=/pnpm-store \
    pnpm install --frozen-lockfile --store-dir /pnpm-store --filter "@tally/web..."
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @tally/web build

# Production packages only; the download cache stays in a build cache, not in the image.
FROM base AS deps
RUN --mount=type=cache,target=/pnpm-store \
    pnpm install --frozen-lockfile --prod --store-dir /pnpm-store --filter "@tally/api..."

# The final image has no pnpm: only Node, the installed packages and the sources.
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app /app
COPY packages/shared/src packages/shared/src
COPY packages/extractor/src packages/extractor/src
COPY packages/validators/src packages/validators/src
COPY apps/api/src apps/api/src
# The golden set and the recorded answers: replay and the demo samples need both.
COPY data/golden data/golden
COPY eval/baselines/claude-haiku-5-5/v2/outputs eval/baselines/claude-haiku-5-5/v2/outputs
COPY --from=web /app/apps/web/dist apps/web/dist
RUN mkdir -p var/files && chown node:node var/files
USER node
ENV HOST=0.0.0.0 \
    API_PORT=3000 \
    WEB_DIR=/app/apps/web/dist \
    FILES_DIR=/app/var/files
EXPOSE 3000
CMD ["node", "apps/api/src/server.ts"]
