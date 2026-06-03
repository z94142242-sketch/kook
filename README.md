# KOOK Codex Bridge

这个服务用于在手机 KOOK 中通过机器人远程指挥本机 Codex。它只监听指定频道、只接受指定 KOOK 用户、只允许操作配置中的白名单项目目录。

## 能力边界

- KOOK 消息接收使用官方 Gateway/WebSocket。
- KOOK 消息回复使用官方频道消息接口 `/api/v3/message/create`。
- Codex 调用、任务记录、项目白名单属于本地后台能力。
- 不使用 KOOK 私有接口、抓包接口或客户端模拟接口。
- 不支持任意 shell 命令。
- 不允许用户传入任意路径，只能传 `projectKey`。
- 不允许 `danger-full-access`，默认 `sandbox=workspace-write`。

## 创建 KOOK Bot

1. 打开 KOOK 开发者中心。
2. 创建机器人。
3. 在机器人配置中开启 WebSocket/Gateway 连接模式。
4. 在消息过滤器中确认机器人可以接收目标服务器和目标频道的消息事件。
5. 把机器人邀请到目标服务器，并确保它有读取频道消息和发送频道消息的权限。

## 复制 KOOK_BOT_TOKEN

在 KOOK 开发者后台的机器人信息页复制 Bot Token。Token 只写入本地 `.env`，不要提交到 Git，不要写到 README 或截图里。

## 安装依赖

```powershell
cd "C:\Users\Administrator\Documents\New project 2\kook-codex-bridge"
npm install
```

## 配置 .env

复制 `.env.example` 为 `.env`：

```powershell
Copy-Item .env.example .env
```

填写：

```env
KOOK_BOT_TOKEN=
KOOK_ALLOWED_USER_ID=
KOOK_ALLOWED_CHANNEL_ID=
KOOK_API_BASE=https://www.kookapp.cn/api/v3
CODEX_COMMAND_PREFIXES=/codex,/c
CODEX_DEFAULT_PROJECT=bridge
CODEX_APPROVAL_POLICY=on-request
CODEX_MAX_CONCURRENT_TASKS=1
KOOK_MESSAGE_MAX_LENGTH=1800
CODEX_TASK_TIMEOUT_MS=600000
```

项目白名单在 `projects.json`：

```json
{
  "bridge": {
    "cwd": "C:\\Users\\Administrator\\Documents\\Codex\\2026-05-22\\codex\\desktop-tutorial-inspect",
    "sandbox": "workspace-write",
    "templates": {
      "check": "请检查项目结构、README、依赖和明显问题，最后给出简短结论。",
      "readme": "请读取 README.md 并总结重点。",
      "build": "请检查项目的构建或类型检查方式，能运行就运行，并说明结果。"
    }
  }
}
```

只允许配置 `sandbox=workspace-write`。不要把任意用户输入拼成 `cwd`。

## 安装 Codex CLI

先确认本机命令行可以执行：

```powershell
codex --version
codex mcp-server
```

如果 `codex mcp-server` 无法启动，桥接服务也无法调用 Codex。

## 启动

```powershell
npm run dev
```

启动后服务会连接 KOOK Gateway。Windows 电脑需要保持开机，桥接服务需要保持运行。

## 手机 KOOK 使用示例

推荐短指令：

```text
/c
/c 项目
/c 状态
/c control 检查一下
/c bridge:readme
/c 继续 请继续
/c 检查一下
```

`/c` 会返回卡片主页，`/c 项目` 会返回项目卡片。`/c 检查一下` 会继续最近任务；如果还没有最近任务，并且配置了 `CODEX_DEFAULT_PROJECT`，则会用默认项目启动新任务。

完整指令仍然可用：

```text
/codex home
/codex projects
/codex run bridge 请读取 README.md 并总结
```

启动任务：

```text
/codex run bridge 请读取 README.md 并总结
```

使用项目模板：

```text
/codex run bridge:check
/codex run bridge:readme
/codex run bridge:build
```

继续任务：

```text
/codex reply <taskId> 请把 README.md 的名字改成 jiang
```

查看任务：

```text
/codex status <taskId>
```

查看最近任务：

```text
/codex status
```

继续最近任务：

```text
/codex reply 请继续
```

也可以省略 `reply`，直接把 `/codex` 后面的内容发给最近任务：

```text
/codex 请继续检查并给出修改建议
```

## 安全和稳定配置

- `CODEX_MAX_CONCURRENT_TASKS`：Codex 并发任务数，默认 `1`。
- `KOOK_MESSAGE_MAX_LENGTH`：KOOK 单条回复分段长度，默认 `1800`。
- `CODEX_TASK_TIMEOUT_MS`：单个 Codex 任务超时时间，默认 `600000`。

当超过并发上限时，任务会进入队列，状态为 `queued`。轮到执行后会变成 `running`，完成后变成 `completed`，失败后变成 `failed`。

## 手机任务卡片

`/codex run` 会发送一张 KOOK CardMessage 任务卡片，展示：

- `taskId`
- 项目 key
- 状态：`queued` / `running` / `completed` / `failed`
- Codex thread
- 最近输出摘要

任务状态变化时，服务会优先调用 `/api/v3/message/update` 原地更新同一张卡片，避免刷屏。

卡片按钮：

- 查看完整输出：分段发送 Codex 完整回复
- 查看状态：重新发送当前任务卡片
- 列出项目：返回项目白名单

按钮使用 KOOK CardMessage 官方 `return-val` 机制，需要开发者后台消息过滤器允许按钮点击事件。

## 指挥舱主页和项目面板

`/codex home` 或 `/c` 会返回 Codex 指挥舱主页卡片，展示：

- Gateway 状态
- Codex MCP 状态
- 当前运行和排队数量
- 项目数量
- 最近任务

`/codex projects` 或 `/c 项目` 会返回项目卡片。项目卡会显示路径、沙箱、最近任务，并根据 `projects.json` 里的 `templates` 生成快捷按钮。

## 高风险确认

当 prompt 包含删除、清空、覆盖、发布、重置、批量、迁移或常见危险命令时，桥接服务不会直接执行，而是先发确认卡。

确认卡按钮：

- 确认执行
- 取消

确认有效期为 5 分钟。

## 任务记录

任务保存在：

```text
data/tasks.json
```

字段包括：

- `taskId`
- `projectKey`
- `cwd`
- `threadId`
- `prompt`
- `finalReply`
- `status`
- `createdAt`
- `updatedAt`
- `error`

## 验收

1. 运行 `npm run dev` 后，机器人保持在线。
2. 手机 KOOK 发 `/c 项目` 能看到 `bridge`。
3. 手机 KOOK 发 `/c bridge 请读取 README.md` 能收到 Codex 回复。
4. 回复中能拿到 `taskId`。
5. 用 `/codex reply <taskId>` 能继续同一个 Codex 会话。
6. 非授权用户发命令无响应。
7. 非白名单频道发命令无响应。
8. Codex 只能操作白名单项目目录。

---

## 启用 club-system 俱乐部管理（可选）

从 v0.2 起，本仓库还内置一个**俱乐部 / 工作室管理后台 + 微信小程序 API**。完整能力清单见 `docs/KOOK-BOT-FEATURES.md`；旧版 `apps/club-system` 的员工端、工作室端、订单、结算能力已经迁移到 `src/club`。它跟 Codex bridge **跑在同一个进程里、共用同一个 KOOK Bot**（一条 Gateway 连接），所以多开一套功能不需要再注册第二个机器人，也不需要起第二个 Node 进程。

### 关掉时（默认）

`.env` 里 `CLUB_ENABLED=false`（默认）或者不写——进程行为跟以前一样，纯 Codex bridge。

### 开启

在 **同一个 `.env`** 里追加：

```env
CLUB_ENABLED=true
CLUB_GUILD_ID=                       # 俱乐部所在 KOOK 服务器 ID
CLUB_COMMAND_CHANNEL_ID=             # 员工发命令的文字频道 ID
CLUB_STANDBY_VOICE_CHANNEL_ID=       # 待命语音房 ID
CLUB_ADMIN_USER_IDS=                 # 管理员 KOOK 用户 ID，逗号分隔
CLUB_COMMAND_PREFIXES=/club,/cm
CLUB_DB_PATH=./data/club.db

# 小程序后端 HTTP API
CLUB_HTTP_ENABLED=true
CLUB_HTTP_PORT=3000
CLUB_HTTP_HOST=0.0.0.0
CLUB_DEV_LOGIN_ENABLED=false         # 生产必须 false
CLUB_SESSION_TTL_HOURS=720

# 微信小程序
CLUB_WX_APP_ID=
CLUB_WX_APP_SECRET=
```

**注意**：Bot 必须同时被邀请进 Codex 那个频道 **和** 俱乐部的命令频道 + 语音频道，并开启相应权限（读写消息 + 搬运语音用户）。

### 启动后

- KOOK Gateway 会按频道分流：Codex 频道走 Codex bridge，俱乐部命令频道走 club-system，语音事件走 club-system
- 端口 3000 上会起一个 HTTP API 给微信小程序调用
- 数据写到 `data/club.db`（SQLite）

---

## 仓库结构

```
src/                 ← 唯一的 Node 后端，单进程
├─ index.ts            orchestrator 入口（KOOK Gateway 分发）
├─ config.ts           合并配置（codex 字段顶层 + club 字段在 .club.*）
├─ kook/               共享 KOOK Gateway 客户端
├─ codex/              Codex bridge 子系统
└─ club/               俱乐部管理子系统（数据库、领域、HTTP API）

apps/miniprogram/   ← 微信小程序员工端（前端，不在 Node 进程内）
scripts/deploy.ps1  ← 服务器一键上线脚本（Windows / PowerShell）
data/               ← 运行时数据：tasks.json（codex）+ club.db（club）
```

入口：开发 `npm run dev`，生产 `node dist/index.js`（构建产物在 `dist/`）。

---

## 服务器升级（雨云 Windows）

RDP 上去 PowerShell 跑：

```powershell
cd C:\Users\Administrator\Documents\kook   # 你实际的仓库路径
.\scripts\deploy.ps1
```

脚本会自动：拉新代码 → npm ci → npm run build → 校验 .env → pm2 重启（如果入口路径变了会先 delete 再 start）。

首次部署前置：
- 装 Node 22+
- 装 Visual Studio Build Tools（Desktop C++）+ Python 3（`better-sqlite3` 原生编译要）
- 装 `npm install -g pm2 pm2-windows-service`

详细 Windows + Caddy + 小程序对接见 `DEPLOY.md`（如有补充需要再加）。
