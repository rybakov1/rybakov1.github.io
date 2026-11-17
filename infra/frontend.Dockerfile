FROM node:22-alpine AS dependencies
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

FROM dependencies AS build
ENV ASTRO_TELEMETRY_DISABLED=1
ARG PUBLIC_API_URL=http://localhost:8000
ARG PUBLIC_SITE_URL=http://localhost:3000
ARG PUBLIC_SITE_NAME=Ценоскоп
ARG PUBLIC_INDEXABLE=false
ENV PUBLIC_API_URL=$PUBLIC_API_URL
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL
ENV PUBLIC_SITE_NAME=$PUBLIC_SITE_NAME
ENV PUBLIC_INDEXABLE=$PUBLIC_INDEXABLE
COPY frontend/ ./
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production ASTRO_TELEMETRY_DISABLED=1 HOST=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
CMD ["npm", "start"]
