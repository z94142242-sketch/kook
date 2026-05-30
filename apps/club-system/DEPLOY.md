# 部署指南

> ⚠️ **v0.2 起 club-system 已合并到根目录的 Codex bridge 进程**，**不再以独立服务部署**。
>
> - 根 `.env` 加 `CLUB_ENABLED=true` + 一组 `CLUB_*` 配置后，根进程自动启动俱乐部功能（KOOK 频道处理 + 端口 3000 上的 HTTP API）。
> - 部署看根目录的 README + 这份文档的「微信小程序额外步骤」「Windows 云服务器选项 4」章节即可。
> - 本文件下方仍保留原有独立部署写法仅供参考，**实际部署请走根目录**。

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

## 选项 4：Windows 云服务器（已有 Codex bridge 跑着的那台）

**适合：** 你已经有一台 Windows 云服务器（24h 开机 + 公网 IP），上面跑着 `kook-codex-bridge`，想顺便把 club-system 加进去。

> 两个应用完全独立：不同的 KOOK Bot Token、不同的数据文件、不同的端口（Codex bridge 不监听端口，club-system 占 3000），可以放心同台部署。

### 一次性准备

1. **再注册一个 KOOK 机器人**给 club-system 用（不能跟 Codex bridge 共用同一个 Bot，一个 Bot 只能被一个进程连接 Gateway）。把新 Bot 邀请到俱乐部所在的 KOOK 服务器，给它「读写消息 + 搬运语音用户」权限。
2. **域名解析**：把一个二级域名（如 `api.your-domain.com`）解析到云服务器公网 IP。
3. **云服务商安全组放行端口** 80（HTTPS 证书校验）和 443（HTTPS）。Windows 防火墙里也放行这两个端口。

### 安装 + 启动 club-system

PowerShell 里：

```powershell
# 假设仓库克隆在 C:\Users\Administrator\Documents\
cd C:\Users\Administrator\Documents\kook\apps\club-system

# 装依赖（如果机器上没装 Node 22，先去 nodejs.org 装）
npm ci

# 复制 .env 模板并填值
Copy-Item .env.example .env
notepad .env
# 必填：
#   CLUB_KOOK_BOT_TOKEN   ← 新 Bot 的 Token
#   CLUB_GUILD_ID         ← 俱乐部所在 KOOK 服务器 ID
#   CLUB_COMMAND_CHANNEL_ID
#   CLUB_STANDBY_VOICE_CHANNEL_ID
#   CLUB_ADMIN_USER_IDS   ← 管理员 KOOK 用户 ID
#   CLUB_WX_APP_ID        ← 小程序 AppID
#   CLUB_WX_APP_SECRET    ← 小程序 Secret
#   CLUB_DEV_LOGIN_ENABLED=false   ← 生产必须 false

npm run build

# 先手动跑一遍确认能起来
node dist/index.js
# 看到：
#   [club] db ready at ...
#   [club] http api listening on 0.0.0.0:3000
#   [club] kook client started
# 就 Ctrl+C 停掉，准备装成 Windows 服务
```

### 装成 Windows 服务（开机自启 + 进程守护）

用 `pm2` + `pm2-windows-service`：

```powershell
npm install -g pm2 pm2-windows-service

# 注册 pm2 自己为 Windows 服务
pm2-service-install -n PM2

# 把 club-system 交给 pm2 管
cd C:\Users\Administrator\Documents\kook\apps\club-system
pm2 start dist/index.js --name club-system
pm2 save
```

之后重启 Windows，club-system 会自动跟 pm2 一起回来。

常用命令：
```powershell
pm2 list                  # 看进程
pm2 logs club-system      # 看日志
pm2 restart club-system   # 重启
```

### 装 Caddy 做 HTTPS 反代

Caddy 单文件，自动签发 + 续期 Let's Encrypt 证书，是 Windows 上最省事的方案。

1. 去 https://caddyserver.com/download 下载 `caddy.exe` Windows 版，放到 `C:\caddy\`
2. 在同目录新建 `Caddyfile`（**无后缀**），内容：

   ```caddy
   api.your-domain.com {
       reverse_proxy localhost:3000
   }
   ```

   把 `api.your-domain.com` 改成你自己的域名。

3. 装成 Windows 服务（用 nssm 最简单）：

   ```powershell
   # 下载 nssm.exe 放到 C:\caddy\ 里
   cd C:\caddy
   .\nssm.exe install Caddy "C:\caddy\caddy.exe" "run --config C:\caddy\Caddyfile"
   .\nssm.exe set Caddy AppDirectory "C:\caddy"
   .\nssm.exe start Caddy
   ```

4. 验证：浏览器打开 `https://api.your-domain.com/health`，看到 `{"ok":true,...}` 就成了。Caddy 第一次会自动去 Let's Encrypt 签证书，等 10 秒左右。

### 升级流程

```powershell
cd C:\Users\Administrator\Documents\kook
git pull
cd apps\club-system
npm ci
npm run build
pm2 restart club-system
```

### Codex bridge 那边动不动？

完全不用动。两个应用独立的代码目录、独立的 .env、独立的 KOOK Bot Token、独立的数据文件。

---

## 接微信小程序所需的额外步骤

后端纯 KOOK Gateway 模式跑通后，再接小程序需要以下几步：

### 1. 准备一个 HTTPS 域名（**硬性要求**）


微信小程序只接受 HTTPS 接口。三种典型做法：

- **轻量服务器 + Caddy（最省事）** — Caddy 会自动申请 + 续期 Let's Encrypt 证书：
  ```caddy
  api.your-domain.com {
      reverse_proxy localhost:3000
  }
  ```
- **轻量服务器 + Nginx + certbot** — 手动签发 + 配置反代到 `localhost:3000`
- **CloudBase 云托管** — 自带 HTTPS，把上面 `cloudbaserc.json` 的 `containerPort` 改成 `3000` 即可

### 2. 在微信公众平台添加服务器域名白名单

登录 [小程序后台](https://mp.weixin.qq.com/) → 开发管理 → 开发设置 → 服务器域名 → request 合法域名加入 `https://api.your-domain.com`

### 3. 配置小程序 AppID + Secret

在后端 `.env` 里填：
```
CLUB_WX_APP_ID=wx开头的小程序 AppID
CLUB_WX_APP_SECRET=小程序后台拿的 Secret
CLUB_DEV_LOGIN_ENABLED=false        # 生产必须 false，否则任何人都能伪造 openid 登录
```

### 4. 改小程序 apiBase

打开 `apps/miniprogram/app.js`，把 `apiBase` 改成你的 HTTPS 域名：
```js
apiBase: "https://api.your-domain.com"
```

### 5. 上传 + 提审

微信开发者工具里上传代码 → 小程序后台提交审核。

### 健康检查

部署完成后任何时候都可以：
```bash
curl https://api.your-domain.com/health
# {"ok":true,"ts":1716000000000}
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
