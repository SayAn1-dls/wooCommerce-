# build from the repo root: docker build -f apps/gateway/Dockerfile .
FROM node:24-alpine AS build
RUN npm install -g pnpm@12.14.0
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/gateway/package.json apps/gateway/
RUN pnpm install --frozen-lockfile --filter gateway
COPY apps/gateway apps/gateway
RUN pnpm --filter gateway build && pnpm --filter gateway deploy --legacy --prod /out

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/gateway/dist ./dist
COPY --from=build /repo/apps/gateway/drizzle ./drizzle
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
