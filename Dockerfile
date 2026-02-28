# Build stage
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx drizzle-kit generate
RUN npm run build

# Dev stage (used by devcontainer)
FROM node:20-bookworm AS dev

RUN apt-get update && apt-get install -y --no-install-recommends \
    vim \
    && rm -rf /var/lib/apt/lists/*

USER node

WORKDIR /home/node

# Production stage
FROM node:20-alpine AS runner

RUN apk add --no-cache python3 make g++

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations

VOLUME ["/data"]

EXPOSE 5000

CMD ["node", "dist/index.cjs"]
