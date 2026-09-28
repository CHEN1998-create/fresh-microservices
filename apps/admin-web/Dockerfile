FROM node:18-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# standalone 产物保留 monorepo 结构：apps/admin-web/server.js
# server.js 找相对路径 ./.next/static，故 WORKDIR 须切到 app 子目录
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./apps/admin-web/.next/static
WORKDIR /app/apps/admin-web
EXPOSE 3001
CMD ["node", "server.js"]
