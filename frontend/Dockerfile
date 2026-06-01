FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL
ARG VITE_MAPBOX_TOKEN
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g vite
COPY --from=builder /app/dist ./dist
EXPOSE 4173
CMD ["sh", "-c", "vite preview --host 0.0.0.0 --port ${PORT:-4173}"]
