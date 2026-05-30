# KOOK 机器人功能总览

一个 KOOK 机器人、一个 Node 进程，承载两套互相独立的功能：

| 子系统 | 开关 | 作用 | 谁用 |
|---|---|---|---|
| **Codex bridge** | 默认开 | 在 KOOK 里远程指挥服务器上的 Codex 干活 | 你自己（单一授权用户） |
| **Club system** | `CLUB_ENABLED=true` 才开 | 俱乐部/工作室员工管理 + 订单 + 结算 | 员工 + 管理员 |

机器人收到 KOOK Gateway 事件后，按**频道 / 事件类型**分流（见 `src/index.ts`）：

- 授权用户在 Codex 频道发的消息/按钮 → Codex bridge
- 俱乐部命令频道的消息/按钮 → Club system
- 语音进出事件 → Club system（记录员工语音时长）

---

## 一、Codex bridge

**前缀**：`/codex` 或 `/c`（可在 `CODEX_COMMAND_PREFIXES` 配）
**权限**：只响应 `KOOK_ALLOWED_USER_ID` 这一个用户、在 `KOOK_ALLOWED_CHANNEL_ID` 这一个频道。其他人 / 其他频道一律无响应。

### 命令

| 命令 | 别名 | 作用 |
|---|---|---|
| `/c` | `/c home` `/c 主页` `/c 菜单` `/c menu` | 指挥舱主页卡片（Gateway 状态 / Codex 状态 / 运行中+排队数 / 项目数 / 最近任务） |
| `/c 项目` | `projects` `project` `p` `列表` | 项目白名单卡片（每个项目显示路径 + 模板快捷按钮） |
| `/c help` | `h` `帮助` | 帮助文本 |
| `/c 状态` | `status` `st` | 最近一个任务的状态 |
| `/c 状态 <taskId>` | `status <taskId>` | 指定任务的状态 |
| `/codex run <项目> <要求>` | `run` `r` `start` `new` `执行` `新` `开始` | 启动新 Codex 任务 |
| `/codex reply <taskId> <要求>` | `reply` `re` `继续` | 继续指定任务的 Codex 会话 |
| `/c 继续 <要求>` | — | 继续**最近**任务（没指定 taskId） |
| `/c <项目>:<模板>` | 例 `/c bridge:readme` | 用项目里预设的模板跑任务 |
| `/c <随便一句话>` | — | 兜底：当作"继续最近任务"的 prompt |

> 模板定义在 `projects.json` 每个项目的 `templates` 字段里。

### 任务卡片按钮（`/codex run` 后弹出的卡）

| 按钮 | 作用 |
|---|---|
| 查看完整输出 | 分段发送 Codex 完整回复 |
| 查看状态 | 重新发当前任务卡片 |
| 列出项目 | 返回项目白名单 |

### 主页卡片按钮

列出项目 / 最近任务状态 / 帮助。

### 项目卡片按钮

每个模板一个快捷按钮（点了直接用该模板跑任务）/ 看该项目最近任务 / 回主页。

### 高风险确认

当 prompt 含「删除 / 清空 / 覆盖 / 发布 / 重置 / 批量 / 迁移」或危险命令（`rm` `del` `drop table` `truncate` 等）时，**不直接执行**，先发确认卡：

| 按钮 | 作用 |
|---|---|
| 确认执行 | 真正入队执行 |
| 取消 | 丢弃 |

确认有效期 5 分钟。

### 任务队列与状态

- 并发上限 `CODEX_MAX_CONCURRENT_TASKS`（默认 1），超出排队
- 状态流转：`queued` → `running` → `completed` / `failed`
- 单任务超时 `CODEX_TASK_TIMEOUT_MS`（默认 10 分钟）
- 任务持久化在 `data/tasks.json`
- 状态变化时优先**原地更新同一张卡片**（`/message/update`），避免刷屏

---

## 二、Club system（俱乐部管理）

**前缀**：`/club` 或 `/cm`（可在 `CLUB_COMMAND_PREFIXES` 配）
**频道**：只在 `CLUB_COMMAND_CHANNEL_ID` 这个文字频道响应命令
**管理员**：`CLUB_ADMIN_USER_IDS` 里列出的 KOOK 用户 ID

### 员工命令

| 命令 | 作用 |
|---|---|
| `/cm` | 工作台主页卡片（当前状态 / 本班语音时长 / 待接订单数） |
| `/cm bind <昵称>` | 绑定 KOOK 账号（首次使用；管理员绑定时自动审核通过） |
| `/cm orders` | 待接订单列表 |
| `/cm income` | 本人收益卡片（本班 / 今日 / 本月 + 今日最近 5 条入账） |

### 管理员命令

| 命令 | 作用 |
|---|---|
| `/cm approve <kook_user_id>` | 审核通过 pending 员工 |
| `/cm staff` | 列出所有员工（状态 / 角色 / ID） |
| `/cm new <频道ID> <标题> [金额] [备注]` | 发布订单（金额可省，省了算 0） |
| `/cm rate` | 查看当前规则（提成率 / 时薪） |
| `/cm rate commission <0~1>` | 设默认提成比例 |
| `/cm rate hourly <元/小时>` | 设时薪（0 = 关闭按时薪结算） |
| `/cm income <kook_user_id>` | 查看他人收益（仅管理员） |

### 工作台主页卡片按钮

| 按钮 | 动作值 | 作用 |
|---|---|---|
| 上班打卡 | `shift:clock-in` | 开班；若已在语音里，自动搬到待命语音房 |
| 下班打卡 | `shift:clock-out` | 关班；按本班语音时长结算时薪 |
| 查看订单 | `order:list` | 列出待接订单 |

### 订单卡片按钮（随订单状态变化）

| 订单状态 | 按钮 | 动作值 | 作用 |
|---|---|---|---|
| `open`（待接单） | 接单并进入房间 | `order:claim:<id>` | 先把员工搬到客户语音房，搬运成功才改状态接单 |
| `claimed`（进行中） | 完成订单 | `order:complete:<id>` | 完单，按提成率结算入账 |
| `claimed`（进行中） | 放弃订单 | `order:release:<id>` | 退回待接单状态 |

> 接单时若员工不在任何语音频道，会弹「请先进入任意语音频道」提示卡（KOOK 只能搬运已在语音里的人）。

### 语音事件（自动，无需命令）

机器人监听 KOOK 的 `joined_channel` / `exited_channel` 系统事件，自动记录员工语音会话（`voice_sessions` 表），用于：

- 上班期间累计「本班语音时长」
- 下班时按时长结算时薪

### 结算类型

`settlements` 表的 `type` 字段：

| 类型 | 中文 | 现状 |
|---|---|---|
| `order_commission` | 订单提成 | ✅ 完单时自动产生 |
| `hourly` | 时薪 | ✅ 下班时按语音时长产生 |
| `bonus` | 奖励 | ⚠️ 数据层支持，**无录入命令** |
| `adjustment` | 调整 | ⚠️ 数据层支持，**无录入命令** |

---

## 三、数据存储

| 文件 | 内容 |
|---|---|
| `data/tasks.json` | Codex 任务记录 |
| `data/club.db` | 俱乐部 SQLite 库（employees / shifts / voice_sessions / orders / settlements / rules / wx_users / sessions） |

---

## 四、HTTP API（端口 3000）

`CLUB_ENABLED=true` 时同进程起一个 Hono HTTP 服务，**给微信小程序调用，没有网页界面**。详见 `src/club/http/`。健康检查 `GET /health`。

---

## 五、路线图（未实现）

- 违规扣分 / 奖励机制（`bonus`/`adjustment` 已有数据结构，缺命令入口）
- 管理员浏览器后台
- 数据报表 / 导出
- 小程序推送通知
