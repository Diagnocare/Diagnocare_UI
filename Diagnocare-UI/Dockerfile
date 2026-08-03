# syntax=docker/dockerfile:1
# ──────────────────────────────────────────────────────────────────────────────
# Diagnocare UI — multi-stage build (Angular 20 → static → nginx)
#
#   Stage 1 (build): npm ci + ng build (production, optimized).
#   Stage 2 (final): copy the static bundle into nginx, add a reverse proxy for
#                    /api and /hubs, and generate assets/runtime-config.js at
#                    container start so the API URL can change per environment
#                    WITHOUT rebuilding the image.
# ──────────────────────────────────────────────────────────────────────────────

# ── Stage 1: build the Angular app ────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies against the lockfile first (better layer caching).
COPY package.json package-lock.json ./
RUN npm ci

# Build the production bundle. outputPath (angular.json) = dist/diagnocareUI-app
COPY . ./
RUN npm run build -- --configuration=production

# ── Stage 2: serve via nginx ──────────────────────────────────────────────────
FROM nginx:1.27-alpine AS final

# SPA + reverse-proxy config.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static bundle from the build stage.
COPY --from=build /app/dist/diagnocareUI-app /usr/share/nginx/html

# Entrypoint writes runtime-config.js from env vars, then hands off to nginx.
COPY docker-entrypoint.sh /docker-entrypoint.d/40-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh

# API_BASE_URL "/" makes the browser call the same origin; nginx proxies /api and
# /hubs to the API container. Override at deploy time to point at any API host.
ENV API_BASE_URL=/
ENV LOGIN_UI_URL=/

EXPOSE 80
