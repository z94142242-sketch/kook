# 帮手须知

雨云 Windows 服务器一次性配置 GitHub Actions 自动部署。**5 分钟搞定**，做完账户主以后不用再登服务器。

---

## 你需要拿到的东西（账户主给）

1. **RDP 登录**
   - 主机：`154.36.164.51`
   - 用户名：`Administrator`
   - 密码：（账户主告诉你）

2. **GitHub 仓库访问**
   - 仓库：https://github.com/z94142242-sketch/kook
   - 用账户主的 GitHub 账号登浏览器，或他给你 admin 协作权限

---

## Step 1 — RDP 登服务器

- **Windows**：开始菜单搜「远程桌面连接」→ 计算机框填 `154.36.164.51` → 连接 → 输账号密码 → 进桌面
- **Mac**：装 Microsoft Remote Desktop（App Store 免费）→ Add PC → Hostname `154.36.164.51` → 双击连
- **Linux**：用 Remmina 或 freerdp `xfreerdp /v:154.36.164.51 /u:Administrator`

证书警告点「仍然连接 / 是」。

## Step 2 — 在 GitHub 拿 runner token

浏览器（**不是服务器里**，你自己电脑就行）打开：

> https://github.com/z94142242-sketch/kook/settings/actions/runners

点 **New self-hosted runner** 按钮。页面会显示一段命令，里面有个 token（形如 `AABBCCDD...`，约 30 字符）。**复制这个 token，准备粘贴**。

⚠️ Token 1 小时过期，**别关页面**，下一步立刻用。

## Step 3 — 服务器上跑安装脚本

回 RDP 桌面：

1. 开始菜单搜「PowerShell」→ **右键 → 以管理员身份运行**
2. 复制粘贴下面四行，按 Enter：

```powershell
cd C:\Users\Administrator\Documents\kook
git fetch origin main
git checkout main
git pull --ff-only origin main
.\scripts\setup-runner.ps1 -Token "粘贴你复制的token"
```

> 如果 `cd` 报错"找不到路径"——问账户主仓库实际在哪儿，把路径替换上去。

脚本会跑 1-2 分钟。中间会**弹密码框**：输入服务器 Administrator 密码（就是 RDP 登录用的那个）。

跑完看到绿色 `✅ Runner 安装完成！` 就成。

## Step 4 — 在 GitHub 打开自动部署开关

浏览器打开：

> https://github.com/z94142242-sketch/kook/settings/variables/actions

点 **New repository variable**：
- **Name**：`AUTO_DEPLOY_ENABLED`
- **Value**：`true`

点 **Add variable**。

## Step 5 — 试跑一次确认

浏览器打开：

> https://github.com/z94142242-sketch/kook/actions/workflows/deploy.yml

右边 **Run workflow** → 选 `main` → **Run workflow**。

10 秒后会出现一个新 run，点进去看实时日志。**绿色完成** = 成功。

---

## 完工

告诉账户主：

> 配好了，去 GitHub 仓库 settings/actions/runners 应该能看到 runner 在线。以后从手机 GitHub app 里 Merge PR 会自动部署。

---

## 排错

| 现象 | 怎么修 |
|---|---|
| Step 3 token 报 expired | token 1 小时过期了。回 Step 2 重新拿一个 |
| Step 3 弹密码框输错 | 密码错了不会自动重试。先在服务器上 `cd C:\actions-runner ; .\svc.cmd uninstall`，删 `C:\actions-runner` 目录，再重跑 Step 3 |
| Step 5 workflow 排队不开始 | 看 Step 4 的 runner 页面，runner 状态是不是绿 Idle。如果是 Offline，回服务器 `cd C:\actions-runner ; .\svc.cmd status`，挂了就 `.\svc.cmd start` |
| Step 5 失败说 `KOOK_REPO_DIR 不存在` | 仓库不在默认路径。重跑 Step 3 带 `-RepoDir "C:\实际\路径"` 参数 |
| `npm ci` 报 `node-gyp` / `MSBuild` | 服务器缺 C++ 编译工具链。装 Visual Studio Build Tools（勾选「使用 C++ 的桌面开发」）+ Python 3，重启 PowerShell 重跑 |

卡死了直接联系账户主。
