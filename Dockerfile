# syntax=docker/dockerfile:1

# ---- Stage 1: build the local-folder frontend ----
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build
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
FROM nginx:alpine@sha256:db35bfc6b2951e7f8a72db5db120288c127ffaeeb4a6d4b95a26fead017d5913 AS runtime

COPY docker/nginx-main.conf /etc/nginx/nginx.conf
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/snippets/orgchartr-security-headers.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

USER 101:101

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
