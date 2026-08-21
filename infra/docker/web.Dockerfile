FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
RUN npm install --workspace apps/web
COPY apps/web ./apps/web
WORKDIR /app/apps/web
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/apps/web/dist/codeguard-web/browser /usr/share/nginx/html
EXPOSE 80
