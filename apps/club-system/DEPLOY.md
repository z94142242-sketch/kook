# 部署指南

本服务可以跑在任何能跑 Docker 的地方。下面按推荐顺序列出三种方式。

## 选项 1：腾讯云轻量服务器 / 阿里云 ECS（最推荐，性价比最高）

**适合：** 现阶段，~30-60 元/月，开箱即用。

### 步骤

1. 买一台 1核 1G 内存的轻量服务器（Ubuntu 22.04 / 24.04）
2. SSH 登录，装 Docker：
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo systemctl enable --now docker
   ```
3. 把仓库克隆下来：
   ```bash
   git clone <your-repo-url>
   cd kook/apps/club-system
   ```
4. 配置环境变量：
   ```bash
   cp .env.example .env
   vim .env   # 填入 KOOK Token 等
   ```
5. 启动：
   ```bash
   docker compose up -d --build
   ```
6. 看日志：
   ```bash
   docker compose logs -f
   ```

数据存在 `./data/club.db`，宿主机上备份这个文件即可全量备份。

### 升级流程

```bash
git pull
docker compose up -d --build
```

---

## 选项 2：腾讯云 CloudBase 云托管（接微信小程序时用）

**适合：** 将来要接微信小程序，让前后端走同一个云账号。

### 准备

1. 开通腾讯云 CloudBase 服务，记下 envId
2. 安装 CLI：
   ```bash
   npm install -g @cloudbase/cli
   tcb login
   ```

### 部署

1. 把 `cloudbaserc.json` 里的 `envId` 填上你的环境 ID
2. 在 CloudBase 控制台预先创建一个**云存储数据卷** `club-data` 给 SQLite 用
3. 在 `cloudbaserc.json` 的 `envParams` 里填入真实 token / 频道 ID（或在控制台「环境变量」里加，更安全）
4. 部署：
   ```bash
   cd apps/club-system
   tcb framework deploy
   ```

CloudBase 会基于本地 Dockerfile 构建镜像并部署到云托管。Cloud Run 模式支持长时运行 + WebSocket，满足 KOOK Gateway 需求。

> 注意：云托管按用量计费，比轻量服务器贵。**MVP 阶段不建议**。

---

## 选项 3：本地 Docker（你自己电脑 / 家庭 NAS）

**适合：** 开发测试，或者你有台 24h 不关机的家用机。

```bash
cd apps/club-system
cp .env.example .env
# 填 .env
docker compose up -d --build
```

退出时 `docker compose down`，数据仍保留在 `./data/`。

---

## 不用 Docker 的纯 Node 部署

如果你不想用 Docker：

```bash
cd apps/club-system
npm ci
npm run build
node dist/index.js
```

配合 `pm2` 或 `systemd` 做开机自启 + 进程守护：

```bash
npm install -g pm2
pm2 start dist/index.js --name club-system
pm2 save
pm2 startup
```

---

## 数据备份

**只需备份一个文件：** `apps/club-system/data/club.db`

简单的备份脚本（每天 4 点备份到 `/backup/`）：

```bash
0 4 * * * cp /path/to/apps/club-system/data/club.db /backup/club-$(date +\%F).db
```

---

## 常见问题

**Q: 服务起来后机器人没反应？**
A: 看 `docker compose logs -f`，最常见原因：
- Token 写错
- 机器人没被邀请到目标服务器
- 命令频道 ID 写错
- 机器人没有「搬运语音用户」权限

**Q: 搬运一直失败？**
A: 检查机器人在目标语音频道的权限，必须开「搬运语音用户」。

**Q: 重启后数据丢了？**
A: Docker 的话确认 `docker-compose.yml` 里 `./data:/app/data` 这个 volume 映射存在。CloudBase 的话确认数据卷挂载到了 `/app/data`。

**Q: 我换了机器，怎么搬数据？**
A: 关掉服务，把 `data/club.db` 文件复制到新机器，启动即可。
