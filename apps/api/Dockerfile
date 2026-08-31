# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/

# Install dependencies across workspaces
RUN npm ci

# Copy API source code
COPY apps/api ./apps/api

# Build TypeScript to JavaScript
WORKDIR /app/apps/api
RUN npm run build

# Stage 2: Production runtime
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Install dumb-init for proper signal handling with multi-mirror fallback and retries
RUN set -eux; \
    installed=0; \
    v=$(cut -d'.' -f1,2 /etc/alpine-release); \
    for mirror in \
        https://dl-cdn.alpinelinux.org/alpine/ \
        https://uk.alpinelinux.org/alpine/ \
        https://dl-4.alpinelinux.org/alpine/ \
        https://mirrors.edge.kernel.org/alpine/ ; do \
      printf "%s\n%s\n" "${mirror}v${v}/main" "${mirror}v${v}/community" > /etc/apk/repositories; \
      if apk add --no-cache dumb-init; then \
        installed=1; \
        break; \
      fi; \
      sleep 2; \
    done; \
    [ "$installed" -eq 1 ] && [ -x /usr/bin/dumb-init ]

# Copy package configurations
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/

# Install only production dependencies
RUN npm ci --omit=dev --workspace=@codeguard/api

# Copy compiled JavaScript output
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Use non-root node user for security
USER node

WORKDIR /app/apps/api
EXPOSE 5000

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/server.js"]
