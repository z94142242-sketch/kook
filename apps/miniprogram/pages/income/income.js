const api = require("../../utils/api.js");
const fmt = require("../../utils/format.js");

const TYPE_LABEL = {
  order_commission: "订单提成",
  hourly: "时薪",
  bonus: "奖励",
  adjustment: "调整"
};

Page({
  data: {
    todayText: "¥0.00",
    monthText: "¥0.00",
    recent: []
  },

  async onShow() {
    await this.refresh();
  },

  async onPullDownRefresh() {
    await this.refresh();
    wx.stopPullDownRefresh();
  },

  async refresh() {
    try {
      const { todayTotal, monthTotal, recent } = await api.income();
      this.setData({
        todayText: fmt.yuan(todayTotal),
        monthText: fmt.yuan(monthTotal),
        recent: recent.map((r) => ({
          ...r,
          _typeLabel: TYPE_LABEL[r.type] || r.type,
          _amountText: fmt.yuan(r.amount),
          _timeText: fmt.time(r.createdAt)
        }))
      });
    } catch (err) {
      console.warn("income load failed", err);
    }
  }
});
