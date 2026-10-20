# build from the repo root: docker build -f apps/notes-mcp/Dockerfile .
FROM node:24-alpine AS build
RUN npm install -g pnpm@12.14.0
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/notes-mcp/package.json apps/notes-mcp/
RUN pnpm install --frozen-lockfile --filter notes-mcp
COPY apps/notes-mcp apps/notes-mcp
RUN pnpm --filter notes-mcp build && pnpm --filter notes-mcp deploy --legacy --prod /out

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/notes-mcp/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
