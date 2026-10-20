# build from the repo root: docker build -f apps/woo-mcp/Dockerfile .
FROM node:24-alpine AS build
RUN npm install -g pnpm@12.14.0
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/woo-mcp/package.json apps/woo-mcp/
RUN pnpm install --frozen-lockfile --filter woo-mcp
COPY apps/woo-mcp apps/woo-mcp
RUN pnpm --filter woo-mcp build && pnpm --filter woo-mcp deploy --legacy --prod /out

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/woo-mcp/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
