import "./_setup.js";
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { resetDbForTest } from "../db/database.js";
import {
  approveEmployee,
  bindEmployee,
  findEmployee,
  listEmployees
} from "../domain/employees.js";

beforeEach(() => resetDbForTest());

describe("employees", () => {
  it("auto-approves admin binding", () => {
    const e = bindEmployee({ kookUserId: "u1", displayName: "张三", autoApprove: true });
    assert.equal(e.status, "active");
    assert.equal(e.displayName, "张三");
    assert.ok(e.approvedAt && e.approvedAt > 0);
  });

  it("creates pending binding when not auto-approved", () => {
    const e = bindEmployee({ kookUserId: "u1", displayName: "张三" });
    assert.equal(e.status, "pending");
    assert.equal(e.approvedAt, null);
  });

  it("is idempotent when binding the same user twice", () => {
    const first = bindEmployee({ kookUserId: "u1", displayName: "张三" });
    const second = bindEmployee({ kookUserId: "u1", displayName: "李四" });
    assert.equal(second.kookUserId, first.kookUserId);
    assert.equal(second.displayName, "张三", "重复绑定不应覆盖原昵称");
  });

  it("approves a pending employee", () => {
    bindEmployee({ kookUserId: "u1", displayName: "张三" });
    const approved = approveEmployee("u1", "admin-1");
    assert.ok(approved);
    assert.equal(approved.status, "active");
    assert.equal(approved.approvedBy, "admin-1");
  });

  it("returns null when approving a non-pending employee", () => {
    bindEmployee({ kookUserId: "u1", displayName: "张三", autoApprove: true });
    assert.equal(approveEmployee("u1", "admin"), null);
  });

  it("returns null when approving unknown employee", () => {
    assert.equal(approveEmployee("ghost", "admin"), null);
  });

  it("finds bound employee", () => {
    bindEmployee({ kookUserId: "u1", displayName: "张三" });
    assert.equal(findEmployee("u1")?.displayName, "张三");
    assert.equal(findEmployee("ghost"), null);
  });

  it("filters list by status", () => {
    bindEmployee({ kookUserId: "u1", displayName: "甲", autoApprove: true });
    bindEmployee({ kookUserId: "u2", displayName: "乙" });
    bindEmployee({ kookUserId: "u3", displayName: "丙" });
    assert.equal(listEmployees().length, 3);
    assert.equal(listEmployees("pending").length, 2);
    assert.equal(listEmployees("active").length, 1);
  });
});
