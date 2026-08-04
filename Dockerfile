# syntax=docker/dockerfile:1

# ---- Stage 1: build frontend + server ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
COPY server/package.json server/package.json
RUN npm ci

COPY frontend ./frontend
COPY server ./server
RUN npm run build

# ---- Stage 2: production runtime ----
FROM node:20-alpine AS runtime
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

CMD ["node", "server/dist/index.js"]
