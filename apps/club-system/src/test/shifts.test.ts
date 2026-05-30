import "./_setup.js";
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { resetDbForTest } from "../db/database.js";
import { bindEmployee } from "../domain/employees.js";
import { addVoiceTime, closeShift, findOpenShift, openShift } from "../domain/shifts.js";

beforeEach(() => {
  resetDbForTest();
  bindEmployee({ kookUserId: "u1", displayName: "张三", autoApprove: true });
});

describe("shifts", () => {
  it("opens a new shift", () => {
    const shift = openShift("u1", 1000);
    assert.equal(shift.status, "open");
    assert.equal(shift.startedAt, 1000);
    assert.equal(shift.endedAt, null);
    assert.equal(shift.totalVoiceMs, 0);
  });

  it("finds the open shift for a user", () => {
    openShift("u1", 1000);
    const open = findOpenShift("u1");
    assert.ok(open);
    assert.equal(open.status, "open");
  });

  it("returns null when no open shift exists", () => {
    assert.equal(findOpenShift("u1"), null);
  });

  it("closes an open shift", () => {
    const shift = openShift("u1", 1000);
    const closed = closeShift(shift.shiftId, 2000);
    assert.ok(closed);
    assert.equal(closed.status, "closed");
    assert.equal(closed.endedAt, 2000);
    assert.equal(findOpenShift("u1"), null);
  });

  it("returns null when closing an already-closed shift", () => {
    const shift = openShift("u1", 1000);
    closeShift(shift.shiftId, 2000);
    assert.equal(closeShift(shift.shiftId, 3000), null);
  });

  it("accumulates voice time", () => {
    const shift = openShift("u1", 1000);
    addVoiceTime(shift.shiftId, 60_000);
    addVoiceTime(shift.shiftId, 120_000);
    const closed = closeShift(shift.shiftId, 5000);
    assert.equal(closed?.totalVoiceMs, 180_000);
  });

  it("ignores zero/negative voice time", () => {
    const shift = openShift("u1", 1000);
    addVoiceTime(shift.shiftId, 0);
    addVoiceTime(shift.shiftId, -100);
    const closed = closeShift(shift.shiftId, 5000);
    assert.equal(closed?.totalVoiceMs, 0);
  });
});
