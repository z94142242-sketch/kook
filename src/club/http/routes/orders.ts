import { Hono } from "hono";
import {
  claimOrder,
  completeOrder,
  findOrder,
  listOpenOrders,
  releaseOrder
} from "../../domain/orders.js";
import { settleOrderCommission } from "../../services/settlement.js";
import { requireActiveEmployee, requireAuth } from "../auth.js";

export const orderRoutes = new Hono();

orderRoutes.get("/", requireAuth, requireActiveEmployee, async (c) => {
  return c.json({ orders: listOpenOrders() });
});

orderRoutes.get("/:orderId", requireAuth, requireActiveEmployee, async (c) => {
  const order = findOrder(c.req.param("orderId"));
  if (!order) return c.json({ error: "order_not_found" }, 404);
  return c.json({ order });
});

orderRoutes.post("/:orderId/claim", requireAuth, requireActiveEmployee, async (c) => {
  const { employee } = c.get("auth");
  const claimed = claimOrder(c.req.param("orderId"), employee!.kookUserId);
  if (!claimed) return c.json({ error: "claim_failed" }, 409);
  // 注意：小程序端不负责语音搬运（小程序没有语音上下文）。
  // 如果员工同时在 KOOK 语音里，可以另起一个搬运请求；这里只改状态。
  return c.json({ order: claimed });
});

orderRoutes.post("/:orderId/complete", requireAuth, requireActiveEmployee, async (c) => {
  const { employee } = c.get("auth");
  const done = completeOrder(c.req.param("orderId"), employee!.kookUserId);
  if (!done) return c.json({ error: "complete_failed" }, 409);
  const settlement = settleOrderCommission(done);
  return c.json({ order: done, settlement });
});

orderRoutes.post("/:orderId/release", requireAuth, requireActiveEmployee, async (c) => {
  const { employee } = c.get("auth");
  const released = releaseOrder(c.req.param("orderId"), employee!.kookUserId);
  if (!released) return c.json({ error: "release_failed" }, 409);
  return c.json({ order: released });
});
