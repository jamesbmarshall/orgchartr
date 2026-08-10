# syntax=docker/dockerfile:1

# ---- Stage 1: build the local-folder frontend ----
FROM node:22-alpine AS build
WORKDIR /app

ARG NPM_REGISTRY=https://registry.npmjs.org/
ARG VITE_FORCE_LOCAL_MODE=true

COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY frontend/package.json frontend/package.json
COPY server/package.json server/package.json
RUN npm ci --registry="$NPM_REGISTRY"

COPY shared ./shared
COPY frontend ./frontend
RUN npm run build -w shared \
  && VITE_FORCE_LOCAL_MODE="$VITE_FORCE_LOCAL_MODE" npm run build -w frontend

# ---- Stage 2: static production runtime ----
FROM nginx:alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
