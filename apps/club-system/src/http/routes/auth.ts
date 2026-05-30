import { Hono } from "hono";
import { z } from "zod";
import { config } from "../../config.js";
import { findEmployee } from "../../domain/employees.js";
import { createSession, revokeSession } from "../../domain/sessions.js";
import { bindKookToWxUser, findWxUser, unbindKookFromWxUser, upsertWxUser } from "../../domain/wxUsers.js";
import { exchangeWxCode } from "../../services/wxLogin.js";
import { requireAuth } from "../auth.js";

export const authRoutes = new Hono();

const wxLoginSchema = z.object({ code: z.string().min(1) });

authRoutes.post("/wx-login", async (c) => {
  const body = wxLoginSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "invalid_body" }, 400);

  const { openid } = await exchangeWxCode(body.data.code);
  const session = createSession(openid);
  const wxUser = findWxUser(openid)!;
  return c.json({
    token: session.token,
    expiresAt: session.expiresAt,
    openid,
    bound: wxUser.kookUserId !== null,
    kookUserId: wxUser.kookUserId
  });
});

const devLoginSchema = z.object({ openid: z.string().min(1) });

/** 开发用：本地直接给一个 openid 就能登录，无需真的微信 */
authRoutes.post("/dev-login", async (c) => {
  if (!config.http.devLoginEnabled) return c.json({ error: "dev_login_disabled" }, 403);
  const body = devLoginSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "invalid_body" }, 400);

  upsertWxUser({ openid: body.data.openid });
  const session = createSession(body.data.openid);
  const wxUser = findWxUser(body.data.openid)!;
  return c.json({
    token: session.token,
    expiresAt: session.expiresAt,
    openid: body.data.openid,
    bound: wxUser.kookUserId !== null,
    kookUserId: wxUser.kookUserId
  });
});

const bindSchema = z.object({ kookUserId: z.string().min(1) });

authRoutes.post("/bind-kook", requireAuth, async (c) => {
  const body = bindSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "invalid_body" }, 400);

  const { wxUser } = c.get("auth");
  const employee = findEmployee(body.data.kookUserId);
  if (!employee) return c.json({ error: "kook_employee_not_found" }, 404);
  if (employee.status !== "active") return c.json({ error: "employee_not_active" }, 400);

  const updated = bindKookToWxUser(wxUser.openid, employee.kookUserId);
  if (!updated) return c.json({ error: "kook_already_bound_by_other_wx" }, 409);

  return c.json({ bound: true, kookUserId: employee.kookUserId, displayName: employee.displayName });
});

authRoutes.post("/unbind-kook", requireAuth, async (c) => {
  const { wxUser } = c.get("auth");
  unbindKookFromWxUser(wxUser.openid);
  return c.json({ unbound: true });
});

authRoutes.post("/logout", requireAuth, async (c) => {
  const auth = c.req.header("authorization");
  const token = auth?.replace(/^Bearer\s+/i, "");
  if (token) revokeSession(token);
  return c.json({ logout: true });
});
