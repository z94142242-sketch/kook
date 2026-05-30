#Requires -Version 5.1
<#
.SYNOPSIS
  GitHub Actions Self-Hosted Runner 一键安装脚本（雨云 Windows 服务器用）。

.DESCRIPTION
  下载最新 runner → 注册到 z94142242-sketch/kook → 装成 Windows 服务 → 设环境变量。
  完成后所有 main 分支 push 都会自动触发 deploy workflow。

.PARAMETER Token
  必填。从 GitHub 仓库 Settings → Actions → Runners → New runner 页面复制的 token。
  Token 有效期约 1 小时。

.PARAMETER InstallDir
  Runner 安装目录，默认 C:\actions-runner

.PARAMETER RepoDir
  kook 仓库在本机的目录，默认 C:\Users\Administrator\Documents\kook。
  会被设到系统环境变量 KOOK_REPO_DIR，给 deploy workflow 用。

.PARAMETER RepoUrl
  GitHub 仓库 URL，默认 https://github.com/z94142242-sketch/kook

.PARAMETER ServiceUser
  Runner 服务的 Windows 用户，默认 Administrator。
  装服务时会交互式询问该用户的密码。

.EXAMPLE
  以管理员身份打开 PowerShell：
  .\setup-runner.ps1 -Token "ABCDEF123456..."
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true, HelpMessage="从 GitHub Settings/Actions/Runners 复制的 token")]
    [string]$Token,

    [string]$InstallDir = "C:\actions-runner",
    [string]$RepoDir = "C:\Users\Administrator\Documents\kook",
    [string]$RepoUrl = "https://github.com/z94142242-sketch/kook",
    [string]$ServiceUser = "Administrator"
)

$ErrorActionPreference = "Stop"

# ---- 必须管理员 ----
$me = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $me.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "请用「以管理员身份运行」打开的 PowerShell 跑本脚本。"
    exit 1
}

Write-Host ""
Write-Host "==> GitHub Actions Runner 一键安装" -ForegroundColor Cyan
Write-Host "    install dir : $InstallDir"
Write-Host "    repo        : $RepoUrl"
Write-Host "    repo dir    : $RepoDir"
Write-Host "    service user: $ServiceUser"
Write-Host ""

# ---- [0/6] 仓库目录预检 ----
if (-not (Test-Path "$RepoDir\package.json")) {
    Write-Host ""
    Write-Host "⚠️  $RepoDir 不像是 kook 仓库（找不到 package.json）。" -ForegroundColor Yellow
    Write-Host "   要么用 -RepoDir 指定正确路径，要么先 git clone $RepoUrl 到那里。"
    Write-Host ""
    $proceed = Read-Host "无视并继续？[y/N]"
    if ($proceed -ne 'y') { exit 1 }
}

# ---- [1/6] 查最新 runner ----
Write-Host "==> [1/6] 查询最新 runner 版本..." -ForegroundColor Cyan
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/actions/runner/releases/latest" -UseBasicParsing
$version = $release.tag_name.TrimStart('v')
$zipName = "actions-runner-win-x64-$version.zip"
$asset = $release.assets | Where-Object { $_.name -eq $zipName }
if (-not $asset) {
    Write-Error "找不到 win-x64 资产：$zipName。可能 GitHub 改了命名，去 https://github.com/actions/runner/releases 手动下。"
    exit 1
}
Write-Host "    v$version"

# ---- [2/6] 准备目录 ----
Write-Host "==> [2/6] 准备 $InstallDir..." -ForegroundColor Cyan
if (Test-Path "$InstallDir\config.cmd") {
    Write-Host "    ⚠️  $InstallDir 里已有 config.cmd（之前装过）。先 .\svc.cmd uninstall 再删目录再重跑。" -ForegroundColor Yellow
    exit 1
}
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir | Out-Null
}
Set-Location $InstallDir

# ---- [3/6] 下载 ----
Write-Host "==> [3/6] 下载 runner（约 100MB）..." -ForegroundColor Cyan
$zipPath = "$InstallDir\$zipName"
if (-not (Test-Path $zipPath)) {
    # ProgressPreference SilentlyContinue 让 Invoke-WebRequest 快 10 倍
    $oldProgress = $ProgressPreference
    $ProgressPreference = 'SilentlyContinue'
    try {
        Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath -UseBasicParsing
    } finally {
        $ProgressPreference = $oldProgress
    }
}

# ---- [4/6] 解压 ----
Write-Host "==> [4/6] 解压..." -ForegroundColor Cyan
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $InstallDir)

# ---- [5/6] 注册到 GitHub ----
Write-Host "==> [5/6] 注册到 $RepoUrl..." -ForegroundColor Cyan
$runnerName = $env:COMPUTERNAME
& "$InstallDir\config.cmd" --unattended `
    --url $RepoUrl `
    --token $Token `
    --name $runnerName `
    --labels "self-hosted,Windows,X64" `
    --work "_work" `
    --replace
if ($LASTEXITCODE -ne 0) {
    Write-Error "config.cmd 失败。检查 token 是否过期（1 小时有效），或先删 $InstallDir 再重试。"
    exit 1
}

# ---- [6/6] 装服务 + 设环境变量 ----
Write-Host "==> [6/6] 装成 Windows 服务并启动..." -ForegroundColor Cyan
Write-Host "    ⚠️ 接下来会弹密码框：输入 $ServiceUser 的登录密码（RDP 登录用的那个）" -ForegroundColor Yellow
& "$InstallDir\svc.cmd" install $ServiceUser
& "$InstallDir\svc.cmd" start

Write-Host "    设置系统环境变量 KOOK_REPO_DIR=$RepoDir..."
[System.Environment]::SetEnvironmentVariable("KOOK_REPO_DIR", $RepoDir, [System.EnvironmentVariableTarget]::Machine)

Write-Host "    重启 runner 服务读取新环境变量..."
& "$InstallDir\svc.cmd" stop
& "$InstallDir\svc.cmd" start

# ---- 完成 ----
Write-Host ""
Write-Host "✅ Runner 安装完成！" -ForegroundColor Green
Write-Host ""
Write-Host "下一步在浏览器里做（2 分钟）：" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1. 打开 $RepoUrl/settings/actions/runners"
Write-Host "     应能看到 1 个 runner、状态绿色 Idle"
Write-Host ""
Write-Host "  2. 打开 $RepoUrl/settings/variables/actions"
Write-Host "     点 New repository variable："
Write-Host "       Name : AUTO_DEPLOY_ENABLED"
Write-Host "       Value: true"
Write-Host ""
Write-Host "  3. 打开 $RepoUrl/actions/workflows/deploy.yml"
Write-Host "     右边点 Run workflow → 选 main → Run workflow"
Write-Host "     等 1 分钟看是否绿色"
Write-Host ""
Write-Host "全绿就完工。以后 PR Merge 自动部署。"
