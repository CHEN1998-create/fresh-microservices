# monorepo 构建：上下文必须是仓库根目录
# docker build -f apps/user-web/Dockerfile -t fresh-user-web .
FROM node:18-alpine AS deps
WORKDIR /app
# npm workspaces：需要根清单/锁文件和本 workspace 清单才能正确安装依赖
COPY package.json package-lock.json ./
COPY apps/user-web/package.json ./apps/user-web/package.json
# 全量安装（含 devDependencies）：next build 依赖 tailwindcss/postcss/typescript
RUN npm install

FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @fresh/user-web

# standalone 产物保留 monorepo 结构：apps/user-web/server.js
# server.js 找相对路径 ./.next/static，故 WORKDIR 须切到 app 子目录
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./apps/user-web/.next/static
WORKDIR /app/apps/user-web
EXPOSE 3000
CMD ["node", "server.js"]
