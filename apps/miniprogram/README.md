# 俱乐部管理系统 - 微信小程序员工端

调用 **后端 club-system 暴露的 HTTP API**（实现位于仓库根的 `src/club/http/`），后端跟 Codex bridge 跑在同一个 Node 进程里。

## 目录

```
app.json              全局路由 + tabBar
app.js                启动时 wx.login → 调 /api/auth/wx-login 拿 token
app.wxss              全局样式
project.config.json   开发者工具项目配置
sitemap.json          
utils/
  api.js              业务接口封装
  format.js           金额 / 时长格式化
pages/
  home/               工作台（状态、打卡、入口）
  bind/               绑定 KOOK 账号
  orders/             待接订单列表 + 接单
  income/             今日/本月收益 + 明细
```

## 本地开发

1. 用 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html) 打开 `apps/miniprogram/` 目录
2. 修改 `project.config.json` 里的 `appid` 为你的小程序 AppID（无 AppID 也能用「测试号」打开）
3. 启动后端（仓库根）：
   ```bash
   # 在仓库根的 .env 里设置：
   #   CLUB_ENABLED=true
   #   CLUB_HTTP_ENABLED=true
   #   CLUB_HTTP_PORT=3000
   #   CLUB_DEV_LOGIN_ENABLED=true   # 本地无微信时方便测试
   #   CLUB_WX_APP_ID=...            # 真上线时填
   #   CLUB_WX_APP_SECRET=...
   npm run dev
   ```
4. 开发者工具里勾选「不校验合法域名」，否则会拒绝 localhost
5. 编译预览，应能看到首页

## 接口约定

所有接口由 `src/club/http/routes/` 实现，参见根 `README.md`。
请求都需要 `Authorization: Bearer <token>` 头（除了 `/api/auth/wx-login` 和健康检查）。

## 生产部署

1. 后端部署到一个**有公网 HTTPS 域名**的服务器（必须 HTTPS，小程序硬性要求）
2. 在微信公众平台 → 开发管理 → 服务器域名里把后端域名加白
3. 改 `app.js` 里的 `apiBase` 为生产域名
4. 上传代码、提交审核

## 未实现 / TODO

- 管理员页面（订单发布、员工审核、规则配置、报表）
- 推送通知（订单提醒、入账通知）
- 我的订单历史
- 头像 / 个性设置
