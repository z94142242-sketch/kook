import type { Context, MiddlewareHandler, Next } from "hono";
import { config } from "../../config.js";
import type { Employee } from "../domain/employees.js";
import { findEmployee } from "../domain/employees.js";
import { findSession } from "../domain/sessions.js";
import { findWxUser, type WxUser } from "../domain/wxUsers.js";

export type AuthContext = {
  wxUser: WxUser;
  employee: Employee | null;
  isAdmin: boolean;
};

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

/** 从 Authorization: Bearer <token> 解出 session，并把 wxUser/employee 挂到 c.var.auth */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const token = extractToken(c);
  if (!token) return c.json({ error: "missing_token" }, 401);

  const session = findSession(token);
  if (!session) return c.json({ error: "invalid_or_expired_token" }, 401);

  const wxUser = findWxUser(session.openid);
  if (!wxUser) return c.json({ error: "wx_user_missing" }, 401);

  const employee = wxUser.kookUserId ? findEmployee(wxUser.kookUserId) : null;
  const isAdmin = !!employee && config.club.adminUserIds.includes(employee.kookUserId);

  c.set("auth", { wxUser, employee, isAdmin });
  await next();
};

/** 需要已绑定 KOOK 并通过审核 */
export const requireActiveEmployee: MiddlewareHandler = async (c, next) => {
  const auth = c.get("auth");
  if (!auth?.employee) return c.json({ error: "kook_not_bound" }, 403);
  if (auth.employee.status !== "active") return c.json({ error: "employee_not_active" }, 403);
  await next();
};

export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const auth = c.get("auth");
  if (!auth?.isAdmin) return c.json({ error: "admin_required" }, 403);
  await next();
};

function extractToken(c: Context): string | null {
  const header = c.req.header("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}
