import "./_setup.js";
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { resetDbForTest } from "../db/database.js";
import { bindEmployee } from "../domain/employees.js";
import {
  claimOrder,
  completeOrder,
  createOrder,
  findOrder,
  listOpenOrders,
  releaseOrder,
  updateOrderCardMessage
} from "../domain/orders.js";

beforeEach(() => {
  resetDbForTest();
  bindEmployee({ kookUserId: "u1", displayName: "张三", autoApprove: true });
  bindEmployee({ kookUserId: "u2", displayName: "李四", autoApprove: true });
});

describe("orders", () => {
  it("creates an open order", () => {
    const order = createOrder({
      title: "测试订单",
      targetVoiceChannelId: "voice-room-1",
      createdBy: "admin"
    });
    assert.equal(order.status, "open");
    assert.equal(order.claimedBy, null);
    assert.equal(order.targetVoiceChannelId, "voice-room-1");
  });

  it("lists only open orders", () => {
    const a = createOrder({ title: "A", targetVoiceChannelId: "v1", createdBy: "admin" });
    createOrder({ title: "B", targetVoiceChannelId: "v2", createdBy: "admin" });
    claimOrder(a.orderId, "u1");
    const open = listOpenOrders();
    assert.equal(open.length, 1);
    assert.equal(open[0].title, "B");
  });

  it("claims an open order", () => {
    const order = createOrder({ title: "A", targetVoiceChannelId: "v1", createdBy: "admin" });
    const claimed = claimOrder(order.orderId, "u1");
    assert.ok(claimed);
    assert.equal(claimed.status, "claimed");
    assert.equal(claimed.claimedBy, "u1");
    assert.ok(claimed.claimedAt && claimed.claimedAt > 0);
  });

  it("rejects double-claim", () => {
    const order = createOrder({ title: "A", targetVoiceChannelId: "v1", createdBy: "admin" });
    claimOrder(order.orderId, "u1");
    assert.equal(claimOrder(order.orderId, "u2"), null, "已被认领的订单不能再被抢");
  });

  it("allows claimer to complete", () => {
    const order = createOrder({ title: "A", targetVoiceChannelId: "v1", createdBy: "admin" });
    claimOrder(order.orderId, "u1");
    const done = completeOrder(order.orderId, "u1");
    assert.equal(done?.status, "completed");
    assert.ok(done?.completedAt);
  });

  it("rejects completion by non-claimer", () => {
    const order = createOrder({ title: "A", targetVoiceChannelId: "v1", createdBy: "admin" });
    claimOrder(order.orderId, "u1");
    assert.equal(completeOrder(order.orderId, "u2"), null);
  });

  it("allows claimer to release back to open", () => {
    const order = createOrder({ title: "A", targetVoiceChannelId: "v1", createdBy: "admin" });
    claimOrder(order.orderId, "u1");
    const released = releaseOrder(order.orderId, "u1");
    assert.equal(released?.status, "open");
    assert.equal(released?.claimedBy, null);
  });

  it("rejects release by non-claimer", () => {
    const order = createOrder({ title: "A", targetVoiceChannelId: "v1", createdBy: "admin" });
    claimOrder(order.orderId, "u1");
    assert.equal(releaseOrder(order.orderId, "u2"), null);
  });

  it("stores card message id for later updates", () => {
    const order = createOrder({ title: "A", targetVoiceChannelId: "v1", createdBy: "admin" });
    updateOrderCardMessage(order.orderId, "msg-123");
    const reread = findOrder(order.orderId);
    assert.equal(reread?.cardMessageId, "msg-123");
  });
});
