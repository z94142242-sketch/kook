import "./_setup.js";
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { resetDbForTest } from "../db/database.js";
import { bindEmployee } from "../domain/employees.js";
import { claimOrder, completeOrder, createOrder } from "../domain/orders.js";
import { addVoiceTime, closeShift, openShift } from "../domain/shifts.js";
import {
  createSettlement,
  hasOrderCommission,
  listSettlements,
  sumAmount
} from "../domain/settlements.js";
import { RULE_KEYS, setRule } from "../domain/rules.js";
import { settleHourlyForShift, settleOrderCommission } from "../services/settlement.js";

beforeEach(() => {
  resetDbForTest();
  bindEmployee({ kookUserId: "u1", displayName: "张三", autoApprove: true });
});

describe("settlements (raw)", () => {
  it("creates a settlement and reads it back", () => {
    const s = createSettlement({
      kookUserId: "u1",
      type: "bonus",
      amount: 25.5,
      note: "好评奖励"
    });
    const list = listSettlements({ kookUserId: "u1" });
    assert.equal(list.length, 1);
    assert.equal(list[0].settlementId, s.settlementId);
    assert.equal(list[0].amount, 25.5);
    assert.equal(list[0].note, "好评奖励");
  });

  it("rounds amount to 2 decimals on insert", () => {
    const s = createSettlement({ kookUserId: "u1", type: "bonus", amount: 12.3456 });
    assert.equal(s.amount, 12.35);
  });

  it("sums amounts safely", () => {
    createSettlement({ kookUserId: "u1", type: "bonus", amount: 10 });
    createSettlement({ kookUserId: "u1", type: "bonus", amount: 20.5 });
    assert.equal(sumAmount(listSettlements({ kookUserId: "u1" })), 30.5);
  });

  it("filters by shift", () => {
    createSettlement({ kookUserId: "u1", type: "bonus", amount: 10, shiftId: "sh_a" });
    createSettlement({ kookUserId: "u1", type: "bonus", amount: 20, shiftId: "sh_b" });
    const a = listSettlements({ kookUserId: "u1", shiftId: "sh_a" });
    assert.equal(a.length, 1);
    assert.equal(a[0].amount, 10);
  });

  it("filters by time range", () => {
    createSettlement({ kookUserId: "u1", type: "bonus", amount: 10 });
    const cutoff = Date.now() + 60_000;
    createSettlement({ kookUserId: "u1", type: "bonus", amount: 20 });
    const before = listSettlements({ kookUserId: "u1", until: cutoff });
    assert.ok(before.length >= 1);
  });
});

describe("settleOrderCommission", () => {
  function makeCompletedOrder(price: number, commissionRate?: number) {
    const order = createOrder({
      title: "T",
      targetVoiceChannelId: "v",
      price,
      commissionRate: commissionRate ?? null,
      createdBy: "admin"
    });
    claimOrder(order.orderId, "u1");
    return completeOrder(order.orderId, "u1")!;
  }

  it("computes commission using global default", () => {
    const order = makeCompletedOrder(100);
    const s = settleOrderCommission(order);
    assert.ok(s);
    assert.equal(s.amount, 50); // default 0.5
    assert.equal(s.baseAmount, 100);
    assert.equal(s.rate, 0.5);
    assert.equal(s.orderId, order.orderId);
  });

  it("respects per-order commission override", () => {
    const order = makeCompletedOrder(100, 0.8);
    const s = settleOrderCommission(order);
    assert.equal(s?.amount, 80);
    assert.equal(s?.rate, 0.8);
  });

  it("uses updated global rate when no override", () => {
    setRule(RULE_KEYS.DEFAULT_COMMISSION_RATE, "0.3");
    const order = makeCompletedOrder(100);
    const s = settleOrderCommission(order);
    assert.equal(s?.amount, 30);
  });

  it("is idempotent: second call returns null and does not double-charge", () => {
    const order = makeCompletedOrder(100);
    settleOrderCommission(order);
    assert.equal(settleOrderCommission(order), null);
    assert.equal(listSettlements({ kookUserId: "u1" }).length, 1);
    assert.ok(hasOrderCommission(order.orderId));
  });

  it("skips when price is 0", () => {
    const order = makeCompletedOrder(0);
    assert.equal(settleOrderCommission(order), null);
  });

  it("skips when order not completed", () => {
    const order = createOrder({
      title: "T",
      targetVoiceChannelId: "v",
      price: 100,
      createdBy: "admin"
    });
    assert.equal(settleOrderCommission(order), null);
  });
});

describe("settleHourlyForShift", () => {
  it("returns null when hourly rate is 0", () => {
    const shift = openShift("u1", 0);
    const closed = closeShift(shift.shiftId, 3_600_000)!;
    assert.equal(settleHourlyForShift(closed), null);
  });

  it("computes hourly settlement", () => {
    setRule(RULE_KEYS.HOURLY_RATE, "30");
    const shift = openShift("u1", 0);
    addVoiceTime(shift.shiftId, 2 * 3_600_000); // 2h of voice time
    const closed = closeShift(shift.shiftId, 5_000_000)!;
    const s = settleHourlyForShift(closed);
    assert.ok(s);
    assert.equal(s.amount, 60); // 2h * 30
    assert.equal(s.baseAmount, 2);
    assert.equal(s.rate, 30);
  });

  it("returns null on open shift", () => {
    setRule(RULE_KEYS.HOURLY_RATE, "30");
    const shift = openShift("u1", 0);
    assert.equal(settleHourlyForShift(shift), null);
  });

  it("returns null when voice time is zero", () => {
    setRule(RULE_KEYS.HOURLY_RATE, "30");
    const shift = openShift("u1", 0);
    const closed = closeShift(shift.shiftId, 1000)!;
    assert.equal(settleHourlyForShift(closed), null);
  });
});
