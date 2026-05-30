import { Hono } from "hono";
import { closeShift, findOpenShift, openShift } from "../../domain/shifts.js";
import { settleHourlyForShift } from "../../services/settlement.js";
import { requireActiveEmployee, requireAuth } from "../auth.js";

export const shiftRoutes = new Hono();

shiftRoutes.post("/clock-in", requireAuth, requireActiveEmployee, async (c) => {
  const { employee } = c.get("auth");
  const existing = findOpenShift(employee!.kookUserId);
  if (existing) return c.json({ shift: existing, alreadyOpen: true });
  const shift = openShift(employee!.kookUserId, Date.now());
  return c.json({ shift, alreadyOpen: false });
});

shiftRoutes.post("/clock-out", requireAuth, requireActiveEmployee, async (c) => {
  const { employee } = c.get("auth");
  const open = findOpenShift(employee!.kookUserId);
  if (!open) return c.json({ error: "no_open_shift" }, 409);
  const closed = closeShift(open.shiftId, Date.now());
  if (!closed) return c.json({ error: "close_failed" }, 500);
  const hourly = settleHourlyForShift(closed);
  return c.json({ shift: closed, hourly });
});

shiftRoutes.get("/current", requireAuth, requireActiveEmployee, async (c) => {
  const { employee } = c.get("auth");
  return c.json({ shift: findOpenShift(employee!.kookUserId) });
});
