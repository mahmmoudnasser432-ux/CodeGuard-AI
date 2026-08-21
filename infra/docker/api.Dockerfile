FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
RUN npm install --workspace apps/api

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/api ./apps/api
WORKDIR /app/apps/api
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY apps/api/package.json ./package.json
EXPOSE 5000
CMD ["node", "dist/server.js"]
