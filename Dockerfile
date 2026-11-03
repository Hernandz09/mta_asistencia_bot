# Imagen de producción para Coolify (build pack Dockerfile).
# Una sola réplica: Discord no admite dos procesos con el mismo token.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN groupadd --system --gid 1001 bot \
  && useradd --system --uid 1001 --gid bot --home-dir /app --shell /usr/sbin/nologin bot
COPY --from=build --chown=bot:bot /app/package.json /app/package-lock.json ./
COPY --from=build --chown=bot:bot /app/node_modules ./node_modules
COPY --from=build --chown=bot:bot /app/dist ./dist
USER bot
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/live').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
