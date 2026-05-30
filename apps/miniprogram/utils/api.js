// 业务接口封装。所有调用都自动带 token（由 app.js 的 wx.request_p 处理）

function get(url) {
  return wx.request_p({ url: `${getApp().globalData.apiBase}${url}`, method: "GET" });
}
function post(url, data) {
  return wx.request_p({ url: `${getApp().globalData.apiBase}${url}`, method: "POST", data });
}
function patch(url, data) {
  return wx.request_p({ url: `${getApp().globalData.apiBase}${url}`, method: "PATCH", data });
}

module.exports = {
  // 鉴权 / 绑定
  bindKook: (kookUserId) => post("/api/auth/bind-kook", { kookUserId }),
  unbindKook: () => post("/api/auth/unbind-kook"),

  // 个人
  me: () => get("/api/me"),
  status: () => get("/api/me/status"),

  // 班次
  clockIn: () => post("/api/shifts/clock-in", {}),
  clockOut: () => post("/api/shifts/clock-out", {}),
  currentShift: () => get("/api/shifts/current"),

  // 订单
  listOrders: () => get("/api/orders"),
  getOrder: (orderId) => get(`/api/orders/${orderId}`),
  claimOrder: (orderId) => post(`/api/orders/${orderId}/claim`, {}),
  completeOrder: (orderId) => post(`/api/orders/${orderId}/complete`, {}),
  releaseOrder: (orderId) => post(`/api/orders/${orderId}/release`, {}),

  // 收益
  income: () => get("/api/income"),

  // 管理员
  adminCreateOrder: (data) => post("/api/admin/orders", data),
  adminListStaff: (status) => get(`/api/admin/staff${status ? `?status=${status}` : ""}`),
  adminApprove: (kookUserId) => post(`/api/admin/staff/${kookUserId}/approve`, {}),
  adminRules: () => get("/api/admin/rules"),
  adminUpdateRules: (data) => patch("/api/admin/rules", data)
};
