# Loudin web — static production build served by nginx, for the
# docker-compose evaluation stack.
#
# nginx also reverse-proxies /api, /uploads and /socket.io to the `api`
# compose service (see nginx.conf), so the browser talks to a single origin
# and VITE_API_BASE_URL can stay empty (same-origin requests, no CORS).

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# VITE_API_BASE_URL is intentionally left empty: the SPA issues same-origin
# /api/* requests, which nginx forwards to the api container.
RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
