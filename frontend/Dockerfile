# ---------- 依赖安装阶段：仅在 package.json / package-lock.json 变动时重建 ----------
FROM node:20-alpine AS deps
WORKDIR /app
# 同时复制 lockfile，保证 npm ci 可复现（等价于后端的 uv sync --frozen）
COPY package.json package-lock.json ./
# 用国内镜像 + BuildKit 缓存挂载：重跑不重下依赖（命中缓存秒级）
RUN --mount=type=cache,target=/root/.npm \
    npm ci --registry=https://registry.npmmirror.com --no-audit --no-fund

# ---------- 构建阶段：改业务代码只重建这一层，不触发依赖重装 ----------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
# .dockerignore 已排除 node_modules/.next，这里不会用本机（Windows）二进制覆盖 alpine 依赖
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# rewrites 在构建时序列化，需在此注入后端地址（compose build args 覆盖）
ARG NEXT_PUBLIC_API_BASE=http://localhost:8000
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
# 前端请求超时（毫秒），构建期内联进浏览器 bundle（compose build args 覆盖）
ARG NEXT_PUBLIC_API_TIMEOUT=120000
ENV NEXT_PUBLIC_API_TIMEOUT=$NEXT_PUBLIC_API_TIMEOUT
RUN npm run build

# ---------- 运行阶段：standalone 产物，最小体积 ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
