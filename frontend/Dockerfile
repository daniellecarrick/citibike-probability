FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_MAPBOX_TOKEN
RUN npm run build

FROM nginx:alpine
RUN apk add --no-cache gettext
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html

# Substitute $PORT and $BACKEND_URL at container start, then launch nginx
CMD ["sh", "-c", "export PORT=${PORT:-80}; envsubst '$PORT $BACKEND_URL' < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
