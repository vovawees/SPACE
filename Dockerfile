# SPACE — образ для Docker/Podman, Railway и любого хостинга с контейнерами.
# Данные (база, файлы, превью) — в томе /data. Локально: docker compose up -d
FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN SPACE_SKIP_PREPARE=1 npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:26-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 STORAGE_DIR=/data
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/server ./src/server
COPY --from=build /app/src/shared ./src/shared
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server/index.ts"]
