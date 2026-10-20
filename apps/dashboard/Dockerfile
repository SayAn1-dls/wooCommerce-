# build from the repo root: docker build -f apps/dashboard/Dockerfile .
FROM node:24-alpine AS build
RUN npm install -g pnpm@12.14.0
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/dashboard/package.json apps/dashboard/
RUN pnpm install --frozen-lockfile --filter dashboard
COPY apps/dashboard apps/dashboard
RUN pnpm --filter dashboard build

FROM nginx:1.28-alpine
COPY apps/dashboard/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /repo/apps/dashboard/dist /usr/share/nginx/html
# uid 101 is the nginx user that ships in the image
USER 101
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
