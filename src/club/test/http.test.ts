// HTTP API 集成测试：用 Hono 的 fetch handler 直接 invoke，不真起 TCP 端口。
import "./_setup.js";
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { resetDbForTest } from "../db/database.js";
import { bindEmployee } from "../domain/employees.js";
import { findOrder } from "../domain/orders.js";
import { listSettlements } from "../domain/settlements.js";
import { buildHttpApp } from "../http/server.js";

const ADMIN_KOOK = "admin1";
const ALICE_KOOK = "alice";

beforeEach(() => resetDbForTest());

async function devLogin(app: ReturnType<typeof buildHttpApp>, openid: string) {
  const res = await app.request("/api/auth/dev-login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ openid })
  });
  assert.equal(res.status, 200, `dev-login ${openid}`);
  return (await res.json()) as { token: string; openid: string; bound: boolean };
}

function authed(token: string, body?: unknown): RequestInit {
  return {
    method: body ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  };
}

describe("HTTP API", () => {
  it("健康检查", async () => {
    const app = buildHttpApp();
    const res = await app.request("/health");
    assert.equal(res.status, 200);
    const data = (await res.json()) as { ok: boolean };
    assert.equal(data.ok, true);
  });

  it("未鉴权访问返回 401", async () => {
    const app = buildHttpApp();
    const res = await app.request("/api/me");
    assert.equal(res.status, 401);
  });

  it("dev-login → /api/me 返回未绑定", async () => {
    const app = buildHttpApp();
    const { token } = await devLogin(app, "wx_alice");
    const res = await app.request("/api/me", authed(token));
    assert.equal(res.status, 200);
    const data = (await res.json()) as { bound: boolean; employee: null };
    assert.equal(data.bound, false);
    assert.equal(data.employee, null);
  });

  it("绑定 KOOK → /api/me 返回员工信息", async () => {
    const app = buildHttpApp();
    bindEmployee({ kookUserId: ALICE_KOOK, displayName: "小爱", autoApprove: true });
    const { token } = await devLogin(app, "wx_alice");

    const bindRes = await app.request("/api/auth/bind-kook", {
      ...authed(token, { kookUserId: ALICE_KOOK })
    });
    assert.equal(bindRes.status, 200);

    const meRes = await app.request("/api/me", authed(token));
    const me = (await meRes.json()) as { bound: boolean; employee: { displayName: string } };
    assert.equal(me.bound, true);
    assert.equal(me.employee.displayName, "小爱");
  });

  it("不能绑定 pending 的员工", async () => {
    const app = buildHttpApp();
    bindEmployee({ kookUserId: ALICE_KOOK, displayName: "小爱" }); // pending
    const { token } = await devLogin(app, "wx_alice");
    const res = await app.request("/api/auth/bind-kook", {
      ...authed(token, { kookUserId: ALICE_KOOK })
    });
    assert.equal(res.status, 400);
  });

  it("一个 KOOK 账号不能被两个微信号同时绑定", async () => {
    const app = buildHttpApp();
    bindEmployee({ kookUserId: ALICE_KOOK, displayName: "小爱", autoApprove: true });
    const a = await devLogin(app, "wx_a");
    const b = await devLogin(app, "wx_b");
    await app.request("/api/auth/bind-kook", { ...authed(a.token, { kookUserId: ALICE_KOOK }) });
    const conflictRes = await app.request("/api/auth/bind-kook", {
      ...authed(b.token, { kookUserId: ALICE_KOOK })
    });
    assert.equal(conflictRes.status, 409);
  });

  it("打卡 → 查状态 → 下班", async () => {
    const app = buildHttpApp();
    bindEmployee({ kookUserId: ALICE_KOOK, displayName: "小爱", autoApprove: true });
    const { token } = await devLogin(app, "wx_alice");
    await app.request("/api/auth/bind-kook", { ...authed(token, { kookUserId: ALICE_KOOK }) });

    const clockIn = await app.request("/api/shifts/clock-in", { ...authed(token, {}) });
    assert.equal(clockIn.status, 200);

    const status = await app.request("/api/me/status", authed(token));
    const s = (await status.json()) as { onShift: boolean };
    assert.equal(s.onShift, true);

    const clockOut = await app.request("/api/shifts/clock-out", { ...authed(token, {}) });
    assert.equal(clockOut.status, 200);
  });

  it("管理员发单 → 员工列订单/接单/完成 → 收益", async () => {
    const app = buildHttpApp();
    bindEmployee({ kookUserId: ADMIN_KOOK, displayName: "老板", autoApprove: true });
    bindEmployee({ kookUserId: ALICE_KOOK, displayName: "小爱", autoApprove: true });

    const admin = await devLogin(app, "wx_admin");
    const alice = await devLogin(app, "wx_alice");
    await app.request("/api/auth/bind-kook", { ...authed(admin.token, { kookUserId: ADMIN_KOOK }) });
    await app.request("/api/auth/bind-kook", { ...authed(alice.token, { kookUserId: ALICE_KOOK }) });

    const createRes = await app.request("/api/admin/orders", {
      ...authed(admin.token, {
        title: "测试单",
        targetVoiceChannelId: "ch-room",
        price: 100
      })
    });
    assert.equal(createRes.status, 200);
    const { order } = (await createRes.json()) as { order: { orderId: string } };

    const listRes = await app.request("/api/orders", authed(alice.token));
    const { orders } = (await listRes.json()) as { orders: Array<{ orderId: string }> };
    assert.equal(orders.length, 1);

    const claimRes = await app.request(`/api/orders/${order.orderId}/claim`, { ...authed(alice.token, {}) });
    assert.equal(claimRes.status, 200);

    const completeRes = await app.request(`/api/orders/${order.orderId}/complete`, {
      ...authed(alice.token, {})
    });
    assert.equal(completeRes.status, 200);
    const completion = (await completeRes.json()) as { settlement: { amount: number } | null };
    assert.equal(completion.settlement?.amount, 50);

    assert.equal(findOrder(order.orderId)?.status, "completed");
    assert.equal(listSettlements({ kookUserId: ALICE_KOOK }).length, 1);

    const incomeRes = await app.request("/api/income", authed(alice.token));
    const income = (await incomeRes.json()) as { todayTotal: number; monthTotal: number };
    assert.equal(income.todayTotal, 50);
  });

  it("非管理员不能调 admin 接口", async () => {
    const app = buildHttpApp();
    bindEmployee({ kookUserId: ALICE_KOOK, displayName: "小爱", autoApprove: true });
    const { token } = await devLogin(app, "wx_alice");
    await app.request("/api/auth/bind-kook", { ...authed(token, { kookUserId: ALICE_KOOK }) });
    const res = await app.request("/api/admin/staff", authed(token));
    assert.equal(res.status, 403);
  });

  it("dev-login 在生产模式下应被拒绝", async () => {
    const { spawnSync } = await import("node:child_process");
    const childScript = `
      import "./src/club/test/_setup.ts";
      const { resetDbForTest } = await import("./src/club/db/database.ts");
      const { buildHttpApp } = await import("./src/club/http/server.ts");
      resetDbForTest();
      const app = buildHttpApp();
      const res = await app.request("/api/auth/dev-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ openid: "wx_prod" })
      });
      if (res.status !== 403) {
        const body = await res.text();
        console.error("expected 403, got " + res.status + ": " + body);
        process.exit(1);
      }
    `;
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", childScript], {
      cwd: process.cwd(),
      env: { ...process.env, CLUB_DEV_LOGIN_ENABLED: "false" },
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
  });

  it("管理员可以更新规则", async () => {
    const app = buildHttpApp();
    bindEmployee({ kookUserId: ADMIN_KOOK, displayName: "老板", autoApprove: true });
    const { token } = await devLogin(app, "wx_admin");
    await app.request("/api/auth/bind-kook", { ...authed(token, { kookUserId: ADMIN_KOOK }) });

    const res = await app.request("/api/admin/rules", {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ defaultCommissionRate: 0.7, hourlyRate: 25 })
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as { effective: { defaultCommissionRate: number; hourlyRate: number } };
    assert.equal(data.effective.defaultCommissionRate, 0.7);
    assert.equal(data.effective.hourlyRate, 25);
  });
});
