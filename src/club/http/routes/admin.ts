import { Hono } from "hono";
import { z } from "zod";
import { approveEmployee, listEmployees } from "../../domain/employees.js";
import { createOrder } from "../../domain/orders.js";
import { RULE_KEYS, getDefaultCommissionRate, getHourlyRate, listRules, setRule } from "../../domain/rules.js";
import { listSettlements, sumAmount } from "../../domain/settlements.js";
import { requireAdmin, requireAuth } from "../auth.js";

export const adminRoutes = new Hono();

adminRoutes.get("/staff", requireAuth, requireAdmin, async (c) => {
  const status = c.req.query("status") as "pending" | "active" | "suspended" | undefined;
  return c.json({ employees: listEmployees(status) });
});

adminRoutes.post("/staff/:kookUserId/approve", requireAuth, requireAdmin, async (c) => {
  const { employee } = c.get("auth");
  const approved = approveEmployee(c.req.param("kookUserId"), employee!.kookUserId);
  if (!approved) return c.json({ error: "not_pending" }, 409);
  return c.json({ employee: approved });
});

const createOrderSchema = z.object({
  title: z.string().min(1),
  targetVoiceChannelId: z.string().min(1),
  price: z.number().nonnegative().optional(),
  commissionRate: z.number().min(0).max(1).optional(),
  customerNote: z.string().optional()
});

adminRoutes.post("/orders", requireAuth, requireAdmin, async (c) => {
  const body = createOrderSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "invalid_body", details: body.error.issues }, 400);

  const { employee } = c.get("auth");
  const order = createOrder({
    title: body.data.title,
    targetVoiceChannelId: body.data.targetVoiceChannelId,
    price: body.data.price ?? 0,
    commissionRate: body.data.commissionRate ?? null,
    customerNote: body.data.customerNote ?? null,
    createdBy: employee!.kookUserId
  });
  return c.json({ order });
});

adminRoutes.get("/income/:kookUserId", requireAuth, requireAdmin, async (c) => {
  const userId = c.req.param("kookUserId");
  const all = listSettlements({ kookUserId: userId });
  return c.json({
    total: sumAmount(all),
    count: all.length,
    settlements: all.slice(0, 100)
  });
});

adminRoutes.get("/rules", requireAuth, requireAdmin, async (c) => {
  return c.json({
    rules: listRules(),
    effective: {
      defaultCommissionRate: getDefaultCommissionRate(),
      hourlyRate: getHourlyRate()
    }
  });
});

const updateRulesSchema = z.object({
  defaultCommissionRate: z.number().min(0).max(1).optional(),
  hourlyRate: z.number().nonnegative().optional()
});

adminRoutes.patch("/rules", requireAuth, requireAdmin, async (c) => {
  const body = updateRulesSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "invalid_body" }, 400);

  const { employee } = c.get("auth");
  if (body.data.defaultCommissionRate !== undefined) {
    setRule(RULE_KEYS.DEFAULT_COMMISSION_RATE, String(body.data.defaultCommissionRate), employee!.kookUserId);
  }
  if (body.data.hourlyRate !== undefined) {
    setRule(RULE_KEYS.HOURLY_RATE, String(body.data.hourlyRate), employee!.kookUserId);
  }
  return c.json({
    effective: {
      defaultCommissionRate: getDefaultCommissionRate(),
      hourlyRate: getHourlyRate()
    }
  });
});
