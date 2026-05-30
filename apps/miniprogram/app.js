App({
  globalData: {
    /** 后端 API 域名。开发：http://localhost:3000；生产：你部署的域名 */
    apiBase: "http://localhost:3000",
    token: "",
    openid: "",
    me: null
  },

  async onLaunch() {
    // 恢复本地保存的 token
    const token = wx.getStorageSync("club_token");
    if (token) this.globalData.token = token;

    // 自动尝试登录
    await this.login();
  },

  async login() {
    try {
      const { code } = await wx.login();
      const { token, openid, bound, kookUserId } = await wx.request_p({
        url: `${this.globalData.apiBase}/api/auth/wx-login`,
        method: "POST",
        data: { code }
      });
      this.globalData.token = token;
      this.globalData.openid = openid;
      this.globalData.me = { bound, kookUserId };
      wx.setStorageSync("club_token", token);
    } catch (err) {
      console.warn("登录失败：", err);
      wx.showToast({ icon: "none", title: "登录失败，请检查网络" });
    }
  }
});

// 把 wx.request 包成 Promise，自动带上鉴权 token
wx.request_p = function (options) {
  const app = getApp();
  return new Promise((resolve, reject) => {
    wx.request({
      ...options,
      header: {
        "content-type": "application/json",
        ...(app?.globalData?.token ? { authorization: `Bearer ${app.globalData.token}` } : {}),
        ...(options.header || {})
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject({ status: res.statusCode, data: res.data });
      },
      fail: reject
    });
  });
};
