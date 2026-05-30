const api = require("../../utils/api.js");
const fmt = require("../../utils/format.js");

Page({
  data: { orders: [] },

  async onShow() {
    await this.refresh();
  },

  async onPullDownRefresh() {
    await this.refresh();
    wx.stopPullDownRefresh();
  },

  async refresh() {
    try {
      const { orders } = await api.listOrders();
      this.setData({
        orders: orders.map((o) => ({ ...o, _priceText: o.price > 0 ? fmt.yuan(o.price) : "未填" }))
      });
    } catch (err) {
      if (err?.data?.error === "kook_not_bound") {
        wx.showToast({ title: "请先绑定 KOOK", icon: "none" });
      } else {
        console.warn("list orders failed", err);
      }
    }
  },

  async claim(e) {
    const orderId = e.currentTarget.dataset.id;
    try {
      await api.claimOrder(orderId);
      wx.showToast({ title: "✅ 接单成功", icon: "none" });
      await this.refresh();
    } catch (err) {
      wx.showToast({ title: "接单失败", icon: "none" });
    }
  }
});
