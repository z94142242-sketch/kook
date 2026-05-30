import "./_setup.js";
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { resetDbForTest } from "../db/database.js";
import {
  RULE_KEYS,
  getDefaultCommissionRate,
  getHourlyRate,
  listRules,
  setRule
} from "../domain/rules.js";

beforeEach(() => resetDbForTest());

describe("rules", () => {
  it("returns default commission rate when not set", () => {
    assert.equal(getDefaultCommissionRate(), 0.5);
  });

  it("returns default hourly rate (0 = off)", () => {
    assert.equal(getHourlyRate(), 0);
  });

  it("persists commission rate", () => {
    setRule(RULE_KEYS.DEFAULT_COMMISSION_RATE, "0.7");
    assert.equal(getDefaultCommissionRate(), 0.7);
  });

  it("clamps commission rate to [0,1]", () => {
    setRule(RULE_KEYS.DEFAULT_COMMISSION_RATE, "1.5");
    assert.equal(getDefaultCommissionRate(), 1);
    setRule(RULE_KEYS.DEFAULT_COMMISSION_RATE, "-0.3");
    assert.equal(getDefaultCommissionRate(), 0);
  });

  it("persists hourly rate", () => {
    setRule(RULE_KEYS.HOURLY_RATE, "30");
    assert.equal(getHourlyRate(), 30);
  });

  it("clamps hourly rate to >=0", () => {
    setRule(RULE_KEYS.HOURLY_RATE, "-5");
    assert.equal(getHourlyRate(), 0);
  });

  it("upserts on repeated set", () => {
    setRule(RULE_KEYS.HOURLY_RATE, "10");
    setRule(RULE_KEYS.HOURLY_RATE, "20");
    assert.equal(getHourlyRate(), 20);
  });

  it("listRules marks defaults", () => {
    const before = listRules();
    assert.ok(before.every((r) => r.isDefault));
    setRule(RULE_KEYS.HOURLY_RATE, "15");
    const after = listRules().find((r) => r.key === RULE_KEYS.HOURLY_RATE);
    assert.equal(after?.isDefault, false);
    assert.equal(after?.value, "15");
  });

  it("falls back to default when stored value is garbage", () => {
    setRule(RULE_KEYS.DEFAULT_COMMISSION_RATE, "not-a-number");
    assert.equal(getDefaultCommissionRate(), 0.5);
  });
});
