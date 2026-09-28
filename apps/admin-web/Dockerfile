# monorepo 构建：上下文必须是仓库根目录
# docker build -f apps/admin-web/Dockerfile -t fresh-admin-web .
FROM node:18-alpine AS deps
WORKDIR /app
# npm workspaces：需要根清单/锁文件和本 workspace 清单才能正确安装依赖
COPY package.json package-lock.json ./
COPY apps/admin-web/package.json ./apps/admin-web/package.json
# 全量安装（含 devDependencies）：next build 依赖 tailwindcss/postcss/typescript
RUN npm install

FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# rewrites() 在 next build 时执行并固化，网关地址必须在构建期注入
# 默认值即生产 compose 的内网服务名，本地源码构建也可直接使用
ARG API_GATEWAY_URL=http://api-gateway:4000
ENV API_GATEWAY_URL=${API_GATEWAY_URL}
RUN npm run build -w @fresh/admin-web

# standalone 产物保留 monorepo 结构：apps/admin-web/server.js
# server.js 找相对路径 ./.next/static，故 WORKDIR 须切到 app 子目录
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
# monorepo 中 next build 在 workspace 目录执行，产物位于 apps/admin-web/.next
# standalone 内部保留 monorepo 结构（apps/admin-web/server.js）
COPY --from=builder /app/apps/admin-web/.next/standalone ./
COPY --from=builder /app/apps/admin-web/.next/static ./apps/admin-web/.next/static
WORKDIR /app/apps/admin-web
EXPOSE 3001
CMD ["node", "server.js"]
