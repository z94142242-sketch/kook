# 一次性配置：让 GitHub 在你服务器上自动部署

配完之后：**手机 GitHub app 里 PR 点「Merge」 → 服务器 30 秒后自动 git pull + build + 重启 pm2**。再也不用 RDP。

下面所有步骤**只做一次**，必须在能打开远程桌面的电脑前做（手机不行，要在服务器上跑安装命令）。

---

## 一次性设置（5 分钟）

### Step 1 — RDP 登服务器 `154.36.164.51`

用 Administrator 账号登（必须是 Administrator 用户，因为 pm2 进程在这个用户下跑，runner 也得是这个用户才能管 pm2）。

### Step 2 — 在 GitHub 创建 runner token

1. 浏览器打开 → https://github.com/z94142242-sketch/kook/settings/actions/runners
2. 点 **New self-hosted runner** 按钮
3. 选 **Windows** + **x64**
4. **不要关页面**——下面 Step 3 要复制里面的命令

### Step 3 — 装 GitHub Actions Runner（服务器 PowerShell 里跑）

**用「以管理员身份运行」打开 PowerShell**（重要！否则装服务会失败）。

跟着 GitHub 那个页面的命令走，**完全照贴**。结构大致是：

```powershell
# 1) 创建文件夹
mkdir C:\actions-runner ; cd C:\actions-runner

# 2) 下载最新 runner（GitHub 页面里的版本号会变，照页面贴）
Invoke-WebRequest -Uri https://github.com/actions/runner/releases/download/v<X.X.X>/actions-runner-win-x64-<X.X.X>.zip -OutFile actions-runner-win-x64.zip

# 3) 解压
Add-Type -AssemblyName System.IO.Compression.FileSystem ; [System.IO.Compression.ZipFile]::ExtractToDirectory("$PWD/actions-runner-win-x64.zip", "$PWD")

# 4) 配置 runner —— 这一句的 token 是 GitHub 给你生成的，复制粘贴
./config.cmd --url https://github.com/z94142242-sketch/kook --token <从-GitHub-页面复制的-token>
```

`config.cmd` 跑起来会问几个问题，全部回车用默认值就行（runner name 默认是机器名、labels 默认就够、work folder 默认 `_work`）。

### Step 4 — 装成 Windows 服务（开机自启）

```powershell
# 在 C:\actions-runner 目录下：
.\svc.sh install Administrator
# 装错用户名了？先 .\svc.sh uninstall 再来
# 提示输入密码 → 输入 Administrator 账号的登录密码

.\svc.sh start
.\svc.sh status
# 看到 "Active: running" 就成了
```

> Windows 上 svc.sh 可能没有，改用 `svc.cmd`，参数一样：`.\svc.cmd install Administrator` → `.\svc.cmd start`。

### Step 5 — 确认 GitHub 看到 runner

回浏览器，刷新 https://github.com/z94142242-sketch/kook/settings/actions/runners
应该看到一条 runner，状态 **Idle / 绿点**。

### Step 6 — 设环境变量（告诉 runner 仓库在哪）

```powershell
# 在「系统」环境变量里加（不是用户级），让 runner 服务能读到
[System.Environment]::SetEnvironmentVariable(
  "KOOK_REPO_DIR",
  "C:\Users\Administrator\Documents\kook",  # 改成你实际路径
  [System.EnvironmentVariableTarget]::Machine
)

# 重启 runner 服务让它读到新环境变量
.\svc.cmd stop
.\svc.cmd start
```

### Step 7 — 打开自动部署开关

浏览器打开 → https://github.com/z94142242-sketch/kook/settings/variables/actions

点 **New repository variable**：
- Name: `AUTO_DEPLOY_ENABLED`
- Value: `true`

存。

### Step 8 — 试跑一次

浏览器打开 → https://github.com/z94142242-sketch/kook/actions/workflows/deploy.yml

点右边 **Run workflow** 按钮 → **Run workflow**。

10 秒内应该看到一个新 run 在跑，点进去看实时日志。最后一步 `deploy.ps1` 完成，pm2 重启，全绿，**完工**。

---

## 之后日常用法（手机也行）

### 部署新代码

1. 我推 PR → CI 自动跑
2. 你手机 GitHub app 里看 PR、点 **Merge**
3. **完事**——main 一更新，自动 deploy workflow 启动，30 秒后服务器跑上新代码

### 不改代码只想重启

手机 GitHub app → Actions tab → **Deploy to 雨云** → **Run workflow** → 选 main 分支 → Run。

### 看部署日志

手机 GitHub app → Actions tab → 最新那次 run → 看实时日志。

---

## 排查

| 现象 | 原因 | 修 |
|---|---|---|
| GitHub 里 runner 状态 `Offline` | 服务挂了 | 服务器 RDP → `cd C:\actions-runner` → `.\svc.cmd status / start` |
| Workflow 报 "No runner matching the labels..." | runner 没注册或挂了 | 同上 |
| 自动 deploy 没触发 | `AUTO_DEPLOY_ENABLED` 没设 `true` | Step 7 |
| 部署跑了但 pm2 没重启 | runner 不是 Administrator 用户 | Step 4 重装时输 Administrator 账号 |
| `KOOK_REPO_DIR 不存在` | Step 6 没做 | 补上 |

任何卡壳贴日志给我看。
