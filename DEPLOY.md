# 部署指南

当前版本是根目录单进程架构：Codex bridge 和 club-system 共用一个 KOOK Bot、一个 KOOK Gateway 连接、一个 Node 进程。旧版 `apps/club-system` 的独立部署入口已经迁移到根目录，生产部署请从仓库根目录执行。

## 当前已包含的旧版 club-system 能力

- 员工绑定、管理员审核
- 上班 / 下班打卡
- KOOK 语音进出事件自动统计时长
- 管理员发单、员工接单并自动搬运到目标语音房
- 完成 / 放弃订单
- 订单提成、时薪结算、防重复入账
- 员工和管理员收益查询
- 微信小程序 HTTP API：`/health`、`/api/auth/*`、`/api/me`、`/api/orders`、`/api/shifts`、`/api/income`、`/api/admin/*`

完整命令和按钮清单见 `docs/KOOK-BOT-FEATURES.md`。

## 生产部署方式：雨云 Windows + pm2

适合已经有 Windows 云服务器、需要同时跑 KOOK Bot 和微信小程序后端的情况。

### 1. 首次准备

在服务器上安装：

- Node.js 22+
- Git
- Python 3
- Visual Studio Build Tools，勾选 `Desktop development with C++`，用于编译 `better-sqlite3`
- pm2：

```powershell
npm install -g pm2 pm2-windows-service
```

如果需要开机自启，管理员 PowerShell 里执行一次：

```powershell
pm2-startup install
```

### 2. 克隆仓库

```powershell
cd C:\Users\Administrator\Documents
git clone https://github.com/z94142242-sketch/kook.git
cd C:\Users\Administrator\Documents\kook
```

如果服务器上已经有仓库，直接进入现有目录即可。

### 3. 配置 `.env`

```powershell
Copy-Item .env.example .env
notepad .env
```

必须填写 Codex bridge 基础配置：

```env
KOOK_BOT_TOKEN=
KOOK_ALLOWED_USER_ID=
KOOK_ALLOWED_CHANNEL_ID=
CODEX_DEFAULT_PROJECT=bridge
```

启用 club-system 时再填写：

```env
CLUB_ENABLED=true
CLUB_GUILD_ID=
CLUB_COMMAND_CHANNEL_ID=
CLUB_STANDBY_VOICE_CHANNEL_ID=
CLUB_ADMIN_USER_IDS=
CLUB_DB_PATH=./data/club.db
CLUB_HTTP_ENABLED=true
CLUB_HTTP_PORT=3000
CLUB_HTTP_HOST=0.0.0.0
CLUB_DEV_LOGIN_ENABLED=false
CLUB_WX_APP_ID=
CLUB_WX_APP_SECRET=
```

生产环境必须保持 `CLUB_DEV_LOGIN_ENABLED=false`。

### 4. 配置项目白名单

`projects.json` 默认项目 key 是 `bridge`，需要把 `cwd` 改成服务器上 Codex 允许操作的真实目录。

```json
{
  "bridge": {
    "cwd": "C:\\Users\\Administrator\\Documents\\your-project",
    "sandbox": "workspace-write"
  }
}
```

不要把任意用户输入拼成 `cwd`；只允许配置固定白名单目录。

### 5. 构建并启动

```powershell
npm ci
npm run build
pm2 start dist\index.js --name kook-bridge
pm2 save
```

查看日志：

```powershell
pm2 logs kook-bridge --lines 50
```

## 后续升级 / 上传服务器

仓库已经提供部署脚本。服务器仓库目录里执行：

```powershell
cd C:\Users\Administrator\Documents\kook
.\scripts\deploy.ps1
```

脚本会自动：

1. `git fetch origin main`
2. 切到 `main`
3. `git pull --ff-only origin main`
4. `npm ci`
5. `npm run build`
6. 校验 `.env`
7. 用 pm2 重启 `dist\index.js`

如仓库不在默认目录：

```powershell
.\scripts\deploy.ps1 -RepoDir "D:\path\to\kook" -PmName "kook-bridge"
```

## GitHub Actions 自动部署

`.github/workflows/deploy.yml` 已配置 main 分支自动部署到雨云 Windows 自托管 runner。

生效条件：

- runner 已安装并在线，设置方法见 `docs/SETUP-AUTO-DEPLOY.md`
- repository variable `AUTO_DEPLOY_ENABLED=true`
- runner 环境变量 `KOOK_REPO_DIR` 指向服务器上的仓库目录；默认是 `C:\Users\Administrator\Documents\kook`

启用后，合并到 `main` 会自动在服务器上执行 `scripts/deploy.ps1`。

## Caddy HTTPS 反向代理

微信小程序正式环境只能请求 HTTPS。后端 HTTP API 默认监听 `localhost:3000` 或 `0.0.0.0:3000`，建议用 Caddy 做反代。

1. 下载 Windows 版 `caddy.exe` 放到 `C:\caddy\`。
2. 新建 `C:\caddy\Caddyfile`：

```caddy
api.your-domain.com {
    reverse_proxy localhost:3000
}
```

3. 把 `api.your-domain.com` 换成真实域名，并把域名解析到服务器公网 IP。
4. 云服务器安全组和 Windows 防火墙放行 80、443。
5. 启动 Caddy 后访问：

```powershell
curl https://api.your-domain.com/health
```

看到 `{ "ok": true }` 就说明小程序后端通了。

## 微信小程序对接

1. 微信公众平台后台把 `https://api.your-domain.com` 加入 request 合法域名。
2. 后端 `.env` 填好 `CLUB_WX_APP_ID` 和 `CLUB_WX_APP_SECRET`。
3. `apps/miniprogram/app.js` 的 `apiBase` 改成你的 HTTPS 域名：

```js
apiBase: "https://api.your-domain.com"
```

没有真实 HTTPS 域名前，不要把小程序生产版提交审核。

## 数据和备份

运行时数据在：

- `data/tasks.json`：Codex 任务记录
- `data/club.db`：club-system SQLite 数据库

备份时至少备份 `data/club.db`。升级前建议先停服务或确保没有写入，再复制数据库文件。

```powershell
pm2 stop kook-bridge
Copy-Item .\data\club.db .\data\club-$(Get-Date -Format yyyyMMdd-HHmmss).db
pm2 start kook-bridge
```

## 常见问题

**机器人没反应**

检查 `.env` 里的 Bot Token、频道 ID、用户 ID；确认 KOOK 开发者后台开启 Gateway/WebSocket，消息过滤器允许消息和按钮事件。

**接单搬运失败**

员工必须已经在某个语音频道里，机器人也必须有目标语音频道的“搬运语音用户”权限。

**部署脚本提示 `.env` 缺配置**

确认 key 不为空，并且 `CLUB_ENABLED=true` 时已经填写 `CLUB_GUILD_ID`、`CLUB_COMMAND_CHANNEL_ID`、`CLUB_STANDBY_VOICE_CHANNEL_ID`。

**小程序请求失败**

确认 `apiBase` 是 HTTPS 域名，不是 `localhost`；确认微信后台 request 合法域名已经配置；确认 `https://域名/health` 能访问。
