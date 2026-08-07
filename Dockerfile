# syntax=docker/dockerfile:1

# ---- Stage 1: build frontend + server ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
COPY server/package.json server/package.json
RUN npm ci

COPY frontend ./frontend
COPY server ./server
RUN npm run build

# ---- Stage 2: production runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
RUN npm ci --omit=dev --workspace=server

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/frontend/dist ./frontend/dist

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data
ENV FRONTEND_DIST=/app/frontend/dist

EXPOSE 3000

# Run as the unprivileged `node` user (uid 1000) shipped with the base image rather than root.
# The bind-mounted host data directory must be writable by uid 1000 (on Docker Desktop this is
# automatic; on a Linux host, `chown 1000:1000` the data directory or make it group-writable).
USER node

# Report unhealthy if the API is down or the data directory isn't writable.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
