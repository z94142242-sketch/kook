import { Hono } from "hono";
import { listSettlements, sumAmount } from "../../domain/settlements.js";
import { requireActiveEmployee, requireAuth } from "../auth.js";

export const incomeRoutes = new Hono();

incomeRoutes.get("/", requireAuth, requireActiveEmployee, async (c) => {
  const { employee } = c.get("auth");
  const now = Date.now();
  const dayStart = startOfDay(now);
  const monthStart = startOfMonth(now);

  const today = listSettlements({ kookUserId: employee!.kookUserId, since: dayStart });
  const month = listSettlements({ kookUserId: employee!.kookUserId, since: monthStart });
  const recent = listSettlements({ kookUserId: employee!.kookUserId }).slice(0, 30);

  return c.json({
    todayTotal: sumAmount(today),
    monthTotal: sumAmount(month),
    recent
  });
});

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfMonth(ts: number) {
  const d = new Date(ts);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
