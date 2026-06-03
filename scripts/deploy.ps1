# 服务器上线脚本（Windows + PowerShell）
#
# 用法（在雨云服务器 RDP 里打开 PowerShell）：
#   cd C:\Users\Administrator\Documents\kook     # 你实际的仓库路径
#   .\scripts\deploy.ps1
#
# 可选参数：
#   .\scripts\deploy.ps1 -RepoDir "D:\path\to\kook" -PmName "kook-bridge"

param(
    [string]$RepoDir = $PSScriptRoot | Split-Path -Parent,
    [string]$PmName  = "kook-bridge",
    [switch]$SkipPmRestart
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==> kook 一体化进程部署脚本" -ForegroundColor Cyan
Write-Host "    仓库目录: $RepoDir"
Write-Host "    pm2 名称: $PmName"
Write-Host ""

# ---- 0) 检查仓库目录 ----
if (-not (Test-Path "$RepoDir\package.json")) {
    Write-Error "目录 $RepoDir 不像是 kook 仓库（找不到 package.json）。用 -RepoDir 参数指定正确路径。"
    exit 1
}
Set-Location $RepoDir

# ---- 1) 拉新代码 ----
Write-Host "==> [1/5] 拉取最新代码..." -ForegroundColor Cyan
git fetch origin main
$current = git rev-parse --abbrev-ref HEAD
if ($current -ne "main") {
    Write-Host "    切换到 main 分支（之前在 $current）"
    git checkout main
}
git pull --ff-only origin main

# ---- 2) 装依赖 ----
Write-Host ""
Write-Host "==> [2/5] 安装依赖（含 better-sqlite3 原生编译）..." -ForegroundColor Cyan
try {
    npm ci
} catch {
    Write-Host ""
    Write-Host "依赖装失败。如果错误信息里有 node-gyp / MSBuild / Python，说明缺编译工具链：" -ForegroundColor Red
    Write-Host "  1. 装 Visual Studio Build Tools，勾选『Desktop development with C++』" -ForegroundColor Yellow
    Write-Host "  2. 装 Python 3" -ForegroundColor Yellow
    Write-Host "  3. 装完重开 PowerShell 再跑本脚本" -ForegroundColor Yellow
    exit 1
}

# ---- 3) 构建 ----
Write-Host ""
Write-Host "==> [3/5] 构建 TypeScript..." -ForegroundColor Cyan
npm run build

# ---- 4) 校验 .env ----
Write-Host ""
Write-Host "==> [4/5] 校验 .env..." -ForegroundColor Cyan
if (-not (Test-Path ".env")) {
    Write-Host "    没找到 .env，从模板复制一份。请先填好再继续。" -ForegroundColor Yellow
    Copy-Item .env.example .env
    Write-Host "    已生成 .env，编辑后重新跑本脚本。"
    exit 1
}
$envText = Get-Content .env -Raw

function Test-EnvValue {
    param([string]$Text, [string]$Key)
    return [regex]::IsMatch($Text, "(?m)^\s*" + [regex]::Escape($Key) + "\s*=\s*\S")
}

function Test-EnvTrue {
    param([string]$Text, [string]$Key)
    return [regex]::IsMatch($Text, "(?mi)^\s*" + [regex]::Escape($Key) + "\s*=\s*true\s*$")
}

foreach ($key in @("KOOK_BOT_TOKEN", "KOOK_ALLOWED_USER_ID", "KOOK_ALLOWED_CHANNEL_ID")) {
    if (-not (Test-EnvValue $envText $key)) {
        Write-Error ".env 缺少 $key 或值为空。补齐后再跑。"
        exit 1
    }
}
if (Test-EnvTrue $envText "CLUB_ENABLED") {
    foreach ($key in @("CLUB_GUILD_ID", "CLUB_COMMAND_CHANNEL_ID", "CLUB_STANDBY_VOICE_CHANNEL_ID")) {
        if (-not (Test-EnvValue $envText $key)) {
            Write-Error "CLUB_ENABLED=true 但 .env 缺少 $key。补齐后再跑。"
            exit 1
        }
    }
}

# ---- 5) pm2 重启 ----
if ($SkipPmRestart) {
    Write-Host ""
    Write-Host "==> [5/5] 跳过 pm2 重启（-SkipPmRestart）" -ForegroundColor Cyan
    Write-Host "    手动启动：node dist\index.js"
    exit 0
}

Write-Host ""
Write-Host "==> [5/5] pm2 重启..." -ForegroundColor Cyan

# 入口路径在不同版本之间变化过，检测当前 pm2 进程是不是用的旧路径，是就 delete 后重建
$jlist = pm2 jlist 2>$null | ConvertFrom-Json
$existing = $jlist | Where-Object { $_.name -eq $PmName }
$newEntry = "dist\index.js"
$entryFull = (Resolve-Path $newEntry).Path

if ($existing) {
    $oldScript = $existing.pm2_env.pm_exec_path
    if ($oldScript -and ($oldScript -ne $entryFull)) {
        Write-Host "    pm2 进程入口已变（$oldScript -> $entryFull），delete 后重建"
        pm2 delete $PmName
        pm2 start $newEntry --name $PmName
        pm2 save
    } else {
        pm2 restart $PmName --update-env
    }
} else {
    Write-Host "    首次启动"
    pm2 start $newEntry --name $PmName
    pm2 save
    Write-Host ""
    Write-Host "    提示：让 pm2 开机自启请执行（管理员 PowerShell 里跑一次）：" -ForegroundColor Yellow
    Write-Host "       pm2-startup install" -ForegroundColor Yellow
}

Start-Sleep -Seconds 2
Write-Host ""
Write-Host "==> 完成。最近 30 行日志：" -ForegroundColor Green
pm2 logs $PmName --lines 30 --nostream
