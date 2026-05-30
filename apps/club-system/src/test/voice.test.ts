import "./_setup.js";
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { resetDbForTest } from "../db/database.js";
import { bindEmployee } from "../domain/employees.js";
import {
  attachSessionToOrder,
  findOpenSession,
  recordVoiceJoin,
  recordVoiceLeave
} from "../domain/voice.js";

beforeEach(() => {
  resetDbForTest();
  bindEmployee({ kookUserId: "u1", displayName: "张三", autoApprove: true });
});

describe("voice sessions", () => {
  it("records voice join with left_at null", () => {
    const session = recordVoiceJoin({
      kookUserId: "u1",
      channelId: "ch-A",
      at: 1000,
      shiftId: null,
      orderId: null
    });
    assert.equal(session.leftAt, null);
    assert.equal(session.durationMs, 0);
    assert.equal(session.channelId, "ch-A");
  });

  it("finds the most recent open session", () => {
    recordVoiceJoin({ kookUserId: "u1", channelId: "ch-A", at: 1000, shiftId: null, orderId: null });
    const open = findOpenSession("u1");
    assert.ok(open);
    assert.equal(open.channelId, "ch-A");
  });

  it("returns null when no open session", () => {
    assert.equal(findOpenSession("u1"), null);
  });

  it("records leave and computes duration", () => {
    recordVoiceJoin({ kookUserId: "u1", channelId: "ch-A", at: 1000, shiftId: null, orderId: null });
    const closed = recordVoiceLeave("u1", 5000);
    assert.ok(closed);
    assert.equal(closed.leftAt, 5000);
    assert.equal(closed.durationMs, 4000);
    assert.equal(findOpenSession("u1"), null);
  });

  it("returns null when leaving without an open session", () => {
    assert.equal(recordVoiceLeave("u1", 5000), null);
  });

  it("clamps negative duration to zero", () => {
    recordVoiceJoin({ kookUserId: "u1", channelId: "ch-A", at: 5000, shiftId: null, orderId: null });
    // 时钟倒退（理论上不该发生，但要兜底）
    const closed = recordVoiceLeave("u1", 1000);
    assert.equal(closed?.durationMs, 0);
  });

  it("attaches session to an order", () => {
    const session = recordVoiceJoin({
      kookUserId: "u1",
      channelId: "ch-A",
      at: 1000,
      shiftId: null,
      orderId: null
    });
    attachSessionToOrder(session.voiceSessionId, "ord-1");
    const reread = findOpenSession("u1");
    assert.equal(reread?.orderId, "ord-1");
  });
});
