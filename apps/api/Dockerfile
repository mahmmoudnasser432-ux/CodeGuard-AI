# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages ./packages

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

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy package configurations
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/

# Install only production dependencies
RUN npm ci --omit=dev --workspace=@codeguard/api

# Copy compiled JavaScript output
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Use non-root node user for security
USER node

WORKDIR /app/apps/api
EXPOSE 5000

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/index.js"]
