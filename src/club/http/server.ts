import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authRoutes } from "./routes/auth.js";
import { meRoutes } from "./routes/me.js";
import { orderRoutes } from "./routes/orders.js";
import { shiftRoutes } from "./routes/shifts.js";
import { incomeRoutes } from "./routes/income.js";
import { adminRoutes } from "./routes/admin.js";

export function buildHttpApp() {
  const app = new Hono();

  // 小程序端通过 wx.request 调用，不会触发 CORS；
  // 但管理后台/调试工具用 fetch 会，所以开放 CORS
  app.use("*", cors({ origin: "*" }));
  app.use("*", logger());

  app.get("/health", (c) => c.json({ ok: true, ts: Date.now() }));

  app.route("/api/auth", authRoutes);
  app.route("/api/me", meRoutes);
  app.route("/api/orders", orderRoutes);
  app.route("/api/shifts", shiftRoutes);
  app.route("/api/income", incomeRoutes);
  app.route("/api/admin", adminRoutes);

  app.notFound((c) => c.json({ error: "not_found", path: c.req.path }, 404));

  app.onError((err, c) => {
    console.error(`[http] error path=${c.req.path}`, err);
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}
