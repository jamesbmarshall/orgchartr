# syntax=docker/dockerfile:1

# ---- Stage 1: build the local-folder frontend ----
FROM node:26-alpine@sha256:aadf416b2cdce311a8811ba3f0608a61b77dbf997500e2eafe781b51f6a0b019 AS build
WORKDIR /app

ARG NPM_REGISTRY=https://registry.npmjs.org/
ARG VITE_STORAGE_MODE=local

COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY frontend/package.json frontend/package.json
COPY server/package.json server/package.json
RUN npm ci --registry="$NPM_REGISTRY"

COPY shared ./shared
COPY frontend ./frontend
COPY scripts/assert-local-bundle.cjs scripts/assert-local-bundle.cjs
RUN npm run build -w shared \
  && VITE_STORAGE_MODE="$VITE_STORAGE_MODE" npm run build -w frontend \
  && npm run verify:local-bundle

# ---- Stage 2: static production runtime ----
FROM nginx:alpine@sha256:4a73073bd557c65b759505da037898b61f1be6cbcc3c2c3aeac22d2a470c1752 AS runtime

COPY docker/nginx-main.conf /etc/nginx/nginx.conf
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/snippets/orgchartr-security-headers.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

USER 101:101

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
