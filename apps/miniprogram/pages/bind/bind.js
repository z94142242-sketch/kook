const api = require("../../utils/api.js");

Page({
  data: { kookUserId: "", loading: false },

  onInput(e) {
    this.setData({ kookUserId: e.detail.value });
  },

  async submit() {
    const kookUserId = this.data.kookUserId.trim();
    if (!kookUserId) {
      wx.showToast({ title: "请输入 KOOK ID", icon: "none" });
      return;
    }
    this.setData({ loading: true });
    try {
      const res = await api.bindKook(kookUserId);
      wx.showModal({
        title: "✅ 绑定成功",
        content: `已绑定到 ${res.displayName}`,
        showCancel: false,
        success: () => wx.navigateBack()
      });
    } catch (err) {
      const code = err?.data?.error;
      let msg = "绑定失败";
      if (code === "kook_employee_not_found") msg = "未找到该员工，请先在 KOOK 里 /cm bind";
      else if (code === "employee_not_active") msg = "该员工未通过审核";
      else if (code === "kook_already_bound_by_other_wx") msg = "该 KOOK 账号已被其他微信绑定";
      wx.showToast({ title: msg, icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  }
});
