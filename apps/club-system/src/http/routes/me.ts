import { Hono } from "hono";
import { findOpenShift } from "../../domain/shifts.js";
import { listSettlements, sumAmount } from "../../domain/settlements.js";
import { requireActiveEmployee, requireAuth } from "../auth.js";

export const meRoutes = new Hono();

meRoutes.get("/", requireAuth, async (c) => {
  const { wxUser, employee, isAdmin } = c.get("auth");
  return c.json({
    openid: wxUser.openid,
    bound: employee !== null,
    isAdmin,
    employee: employee
      ? {
          kookUserId: employee.kookUserId,
          displayName: employee.displayName,
          role: employee.role,
          status: employee.status
        }
      : null
  });
});

meRoutes.get("/status", requireAuth, requireActiveEmployee, async (c) => {
  const { employee } = c.get("auth");
  const openShift = findOpenShift(employee!.kookUserId);
  const dayStart = startOfDay(Date.now());
  const today = listSettlements({ kookUserId: employee!.kookUserId, since: dayStart });
  return c.json({
    onShift: openShift !== null,
    shift: openShift,
    todayIncome: sumAmount(today)
  });
});

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
