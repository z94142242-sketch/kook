# ---- 构建阶段 ----------------------------------------------------------
# better-sqlite3 是原生模块，需要 build-essential + python3 来编译
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# 装编译原生模块需要的依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# 砍掉 devDependencies
RUN npm prune --omit=dev

# ---- 运行阶段 ----------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

# 创建非 root 用户
RUN useradd -m -u 10001 app

# 数据目录持久化挂载点
RUN mkdir -p /app/data && chown -R app:app /app

COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/package.json ./package.json

USER app

# 默认 DB 路径写到 /app/data，部署时挂载这个目录即可持久化
ENV CLUB_DB_PATH=/app/data/club.db

# HTTP API 默认端口
EXPOSE 3000

CMD ["node", "dist/index.js"]
