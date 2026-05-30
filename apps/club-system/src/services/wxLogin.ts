import { config } from "../config.js";
import { upsertWxUser } from "../domain/wxUsers.js";

/**
 * 用 wx.login() 拿到的 code 换 openid（小程序登录）。
 * 文档：https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/login/auth.code2Session.html
 */
export async function exchangeWxCode(code: string): Promise<{ openid: string; unionid?: string }> {
  if (!config.wx.appId || !config.wx.appSecret) {
    throw new Error("微信小程序未配置 APP_ID / APP_SECRET");
  }
  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", config.wx.appId);
  url.searchParams.set("secret", config.wx.appSecret);
  url.searchParams.set("js_code", code);
  url.searchParams.set("grant_type", "authorization_code");

  const response = await fetch(url);
  const data = (await response.json()) as {
    openid?: string;
    unionid?: string;
    errcode?: number;
    errmsg?: string;
  };
  if (data.errcode || !data.openid) {
    throw new Error(`微信登录失败：${data.errmsg ?? "未知"} (code ${data.errcode ?? "?"})`);
  }
  // 顺手 upsert
  upsertWxUser({ openid: data.openid, unionid: data.unionid });
  return { openid: data.openid, unionid: data.unionid };
}
