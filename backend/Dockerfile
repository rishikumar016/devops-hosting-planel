# syntax=docker/dockerfile:1.7

# Build context = repo root (so we can reach both backend/ and frontend/).
# Build with:  docker build -f backend/Dockerfile -t hcp-backend .

# ---------- 1. frontend builder ----------
FROM node:20-alpine AS frontend-builder
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------- 2. backend prod deps ----------
FROM node:20-alpine AS backend-deps
WORKDIR /build/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# ---------- 3. runtime ----------
FROM node:20-alpine AS runtime
RUN apk add --no-cache tini openssh-client
WORKDIR /app

COPY --from=backend-deps /build/backend/node_modules ./node_modules
COPY backend/package*.json ./
COPY backend/src ./src
COPY --from=frontend-builder /build/frontend/dist ./frontend-dist

ENV NODE_ENV=production \
    PORT=4000

RUN addgroup -S app && adduser -S app -G app \
 && chown -R app:app /app
USER app

EXPOSE 4000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
