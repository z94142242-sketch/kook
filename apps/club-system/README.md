# KOOK 俱乐部管理系统

员工端 + 工作室端的 KOOK 综合管理系统。

## 当前能力（MVP）

**员工端（KOOK 卡片）：**
- 绑定 KOOK 账号
- 上班/下班打卡
- 语音时长自动统计（基于 KOOK 语音进出事件）
- 接单 → 自动搬运到目标语音房
- 完成 / 放弃订单
- 查看本班 / 今日 / 本月收益

**工作室端：**
- 管理员审核员工
- 发布订单（`/cm new <频道ID> <标题> [金额]`）
- 查看员工列表
- 配置规则：默认提成比例、时薪
- 查看任意员工收益

**结算（Phase 4）：**
- 订单完成 → 自动按 `订单金额 × 提成比例` 入账
- 下班 → 若配置了时薪，自动按 `语音时长 × 时薪` 入账
- 防重复入账（同一订单只结一次）
- 调整金额到 2 位小数精度

**KOOK 端：**
- 通过 Gateway WebSocket 监听消息、按钮、语音事件
- 通过 `/api/v3/channel/move-user` 搬运用户

## 目录

```
src/
  config.ts                环境变量与配置
  index.ts                 入口，串起 Kook + DB + handlers
  db/                      SQLite 数据访问
    schema.sql             表结构
    database.ts            连接 & 初始化
  kook/                    KOOK Gateway 客户端
    client.ts              连接、心跳、重连、API 调用
    cards.ts               CardMessage 构造器
    types.ts               系统事件类型
  domain/                  领域模型（纯数据 + CRUD）
    employees.ts
    shifts.ts
    voice.ts
    orders.ts
  services/                跨领域操作
    voiceMove.ts           搬运用户的原子操作
  handlers/                KOOK 事件入口
    message.ts             解析文字命令
    button.ts              处理卡片按钮
    voiceEvent.ts          处理语音进出
```

## 部署位置无关性

这个服务可以跑在：
- 你本地 Windows 电脑（开发期）
- 阿里云 / 腾讯云轻量服务器（推荐生产）
- 腾讯云 CloudBase 云托管（容器，将来接微信小程序时使用）

只要 24h 在线，且能访问 `https://www.kookapp.cn`。

## 配置

复制 `.env.example` → `.env`，填写：

```env
CLUB_KOOK_BOT_TOKEN=          # KOOK 机器人 Token
CLUB_GUILD_ID=                # 服务器 ID
CLUB_COMMAND_CHANNEL_ID=      # 命令文字频道
CLUB_STANDBY_VOICE_CHANNEL_ID=# 待命语音房
CLUB_ADMIN_USER_IDS=          # 管理员 KOOK 用户 ID（逗号分隔）
```

机器人需要的 KOOK 权限：
- 查看 / 发送消息（命令频道）
- 查看 / 进入 / 搬运语音用户（所有相关语音频道）
- 接收消息事件、按钮事件、语音进出事件

## 启动

```bash
cd apps/club-system
npm install
npm run dev
```

构建 / 类型检查：

```bash
npm run typecheck
npm run build
```

## 数据

SQLite 文件：`apps/club-system/data/club.db`

表：
- `employees` 员工 + 绑定状态
- `shifts` 班次（上班→下班）
- `voice_sessions` 每段语音的原子记录
- `orders` 订单 / 任务

## 命令速查

| 用户 | 命令 | 作用 |
|------|------|------|
| 所有人 | `/cm` | 工作台主页 |
| 所有人 | `/cm bind <昵称>` | 申请绑定（管理员自动通过） |
| 所有人 | `/cm orders` | 列出待接订单 |
| 所有人 | `/cm income` | 查看本人收益（本班/今日/本月） |
| 管理员 | `/cm approve <kook_user_id>` | 审核通过 |
| 管理员 | `/cm staff` | 员工列表 |
| 管理员 | `/cm new <频道ID> <标题> [金额] [备注]` | 发布订单 |
| 管理员 | `/cm rate` | 查看规则 |
| 管理员 | `/cm rate commission <0~1>` | 设默认提成比例 |
| 管理员 | `/cm rate hourly <元/小时>` | 设时薪（0=关闭） |
| 管理员 | `/cm income <kook_user_id>` | 查看他人收益 |

## 接单 → 搬运流程

```
管理员 /cm new <房间ID> <标题>     ← 发布订单
            ↓
KOOK 频道里出现订单卡
            ↓
员工挂在任意语音频道
            ↓
员工点「接单并进入房间」
            ↓
机器人调 KOOK /channel/move-user
            ↓
员工被瞬间搬运到客户房间
            ↓
当前语音 session 自动关联到此订单
```

## 下一步路线（未实现）

- 工作室端 Web 管理后台（浏览器内查表 / 导出）
- 数据统计 / 报表（员工排行、日/月汇总图表）
- 违规扣分 / 奖励机制
- HTTP API 层（给微信小程序调用）
- 数据导出（CSV / Excel）

## 数据库升级说明

Phase 4 给 `orders` 表加了 `price` / `commission_rate` 字段，并新增 `settlements` + `rules` 表。
如果你已有运行中的 `data/club.db`，需要删除后让服务重建：

```bash
rm apps/club-system/data/club.db
npm run dev
```

（MVP 阶段，没有迁移脚本。生产化时再加 ALTER TABLE 迁移。）
