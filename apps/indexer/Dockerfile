# ---- 1. Builder Stage ----
FROM node:18-alpine AS builder
WORKDIR /usr/src/app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

RUN npx prisma generate

RUN npm run build indexer

RUN cp ./generated/prisma/libquery_engine-linux-musl-openssl-3.0.x.so.node ./dist/apps/indexer

# ---- 2. Production Stage ----
FROM node:18-alpine AS production
WORKDIR /usr/src/app

ENV PRISMA_QUERY_ENGINE_LIBRARY=/usr/src/app/dist/apps/indexer/libquery_engine-linux-musl-openssl-3.0.x.so.node

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --legacy-peer-deps

COPY --from=builder /usr/src/app/dist ./dist

COPY --from=builder /usr/src/app/prisma ./prisma

CMD ["/bin/sh", "-c", "npx prisma migrate deploy && node dist/apps/indexer/main.js"]