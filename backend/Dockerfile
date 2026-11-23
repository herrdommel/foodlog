# node v26.13.1 on alpine
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS build
RUN npm install -g pnpm@12.16.1
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
RUN pnpm install --frozen-lockfile --filter @foodlog/backend...
COPY shared shared
COPY backend backend
RUN pnpm --filter @foodlog/backend build
RUN pnpm --filter @foodlog/backend deploy --prod /out

# node v26.13.1 on alpine
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5
LABEL org.opencontainers.image.licenses="AGPL-3.0-or-later"
ENV NODE_ENV=production
WORKDIR /app
COPY LICENSE ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./
COPY --from=build /repo/backend/dist ./dist
COPY --from=build /repo/backend/drizzle ./drizzle
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "dist/server.js"]
