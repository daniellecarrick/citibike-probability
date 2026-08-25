# syntax=docker/dockerfile:1.6
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN --mount=type=secret,id=mapbox_token \
    VITE_MAPBOX_TOKEN="$(cat /run/secrets/mapbox_token)" npm run build

FROM nginx:alpine
RUN apk add --no-cache gettext
COPY nginx.conf.template        /etc/nginx/nginx.conf.template
COPY nginx-static.conf.template /etc/nginx/nginx-static.conf.template
COPY docker-entrypoint.sh       /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
COPY --from=builder /app/dist /usr/share/nginx/html

CMD ["/docker-entrypoint.sh"]
