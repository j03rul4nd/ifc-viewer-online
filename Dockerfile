# syntax=docker/dockerfile:1

# ── Stage 1: build the Vite static bundle ────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Build-time public env (Vite inlines VITE_* at build time, not runtime).
ARG VITE_POSTHOG_KEY=""
ARG VITE_POSTHOG_HOST=""
ARG VITE_SUBSCRIBE_URL=""
ARG VITE_REPORT_URL=""
ENV VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY \
    VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST \
    VITE_SUBSCRIBE_URL=$VITE_SUBSCRIBE_URL \
    VITE_REPORT_URL=$VITE_REPORT_URL

# Install dependencies against the lockfile first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# Build. Override Vite's `base` so the app is served from the container root
# (the repo default base is '/ifc-viewer-online/' for GitHub Pages).
COPY . .
RUN npm run build -- --base=/

# ── Stage 2: serve with nginx ────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# COOP/COEP + SPA fallback + wasm mime + gzip live here.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost/ || exit 1
