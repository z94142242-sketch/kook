const api = require("../../utils/api.js");
const fmt = require("../../utils/format.js");

Page({
  data: {
    me: { bound: false },
    status: { onShift: false, shift: null, todayIncome: 0 },
    shiftVoiceText: "",
    todayText: "¥0.00"
  },

  async onShow() {
    await this.refresh();
  },

  async refresh() {
    try {
      const me = await api.me();
      this.setData({ me });
      if (me.bound) {
        const status = await api.status();
        this.setData({
          status,
          shiftVoiceText: fmt.duration(status.shift?.totalVoiceMs ?? 0),
          todayText: fmt.yuan(status.todayIncome)
        });
      }
    } catch (err) {
      console.warn("refresh failed", err);
    }
  },

  goBind() {
    wx.navigateTo({ url: "/pages/bind/bind" });
  },
  goOrders() {
    wx.switchTab({ url: "/pages/orders/orders" });
  },
  goIncome() {
    wx.switchTab({ url: "/pages/income/income" });
  },

  async clockIn() {
    try {
      await api.clockIn();
      wx.showToast({ title: "✅ 上班打卡成功", icon: "none" });
      await this.refresh();
    } catch (err) {
      wx.showToast({ title: "打卡失败", icon: "none" });
    }
  },

  async clockOut() {
    try {
      const res = await api.clockOut();
      const note = res.hourly ? `\n时薪结算 ${fmt.yuan(res.hourly.amount)}` : "";
      wx.showModal({
        title: "下班成功",
        content: `本班语音 ${fmt.duration(res.shift.totalVoiceMs)}${note}`,
        showCancel: false
      });
      await this.refresh();
    } catch (err) {
      wx.showToast({ title: "下班失败", icon: "none" });
    }
  }
});
