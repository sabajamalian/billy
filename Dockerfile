# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --include=dev

FROM deps AS builder
ENV NEXT_TELEMETRY_DISABLED=1 \
  DATABASE_URL=file:/app/data/build.db
COPY . .
RUN mkdir -p /app/data && npx prisma generate
RUN DATABASE_URL=:memory: npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  PORT=3000 \
  HOSTNAME=0.0.0.0 \
  DATABASE_URL=file:/app/data/billy.db

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates dumb-init \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 billy \
  && useradd --system --uid 1001 --gid billy --create-home billy

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/package.json ./package.json

RUN npm install --omit=dev --no-save --ignore-scripts prisma@7.8.0 dotenv@17.4.2 \
  && mkdir -p /app/data/uploads \
  && chown -R billy:billy /app/data /home/billy /app/node_modules/@prisma /app/node_modules/prisma

COPY --chown=billy:billy start.sh ./start.sh
RUN chmod 755 /app/start.sh

USER billy
EXPOSE 3000
CMD ["dumb-init", "/app/start.sh"]
