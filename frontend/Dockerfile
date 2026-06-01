FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_MAPBOX_TOKEN
RUN npm run build

FROM nginx:alpine
RUN apk add --no-cache gettext
COPY nginx.conf.template        /etc/nginx/nginx.conf.template
COPY nginx-static.conf.template /etc/nginx/nginx-static.conf.template
COPY docker-entrypoint.sh       /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
COPY --from=builder /app/dist /usr/share/nginx/html

CMD ["/docker-entrypoint.sh"]
