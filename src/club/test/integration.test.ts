import "./_setup.js";
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { resetDbForTest } from "../db/database.js";
import { handleButton } from "../handlers/button.js";
import { handleMessage } from "../handlers/message.js";
import { handleVoiceEvent } from "../handlers/voiceEvent.js";
import type { KookButtonEvent, KookMessageEvent, KookVoiceEvent } from "../../kook/types.js";
import { findOpenShift } from "../domain/shifts.js";
import { findOrder, listOpenOrders } from "../domain/orders.js";
import { listSettlements, sumAmount } from "../domain/settlements.js";
import { findEmployee } from "../domain/employees.js";
import { MockKookClient } from "./mock/mockKookClient.js";

const ADMIN = "admin1";
const ALICE = "alice";
const BOB = "bob";
const CMD_CH = "ch-cmd";
const STANDBY = "ch-standby";
const ROOM_A = "ch-customer-A";

function msg(content: string, authorId: string, channelId = CMD_CH): KookMessageEvent {
  return {
    kind: "message",
    channelId,
    authorId,
    authorName: authorId,
    content,
    msgId: `m_${Math.random().toString(36).slice(2, 8)}`,
    raw: {}
  };
}

function btn(value: string, userId: string, channelId = CMD_CH): KookButtonEvent {
  return {
    kind: "button",
    channelId,
    userId,
    userName: userId,
    value,
    msgId: "b_1",
    raw: {}
  };
}

function voice(state: "join" | "leave", userId: string, channelId: string, at: number): KookVoiceEvent {
  return { kind: "voice", state, userId, channelId, at, raw: {} };
}

beforeEach(() => resetDbForTest());

describe("integration: 完整业务流", () => {
  it("happy path：绑定 → 上班 → 接单搬运 → 完成入账 → 查收益", async () => {
    const mock = new MockKookClient();
    const kook = mock.asClient();

    // 1) 管理员先把自己绑了
    await handleMessage(kook, msg("/cm bind 老板", ADMIN));
    assert.equal(findEmployee(ADMIN)?.status, "active", "管理员绑定后应自动通过");

    // 2) 普通员工绑定（默认 pending）
    await handleMessage(kook, msg("/cm bind 小爱", ALICE));
    assert.equal(findEmployee(ALICE)?.status, "pending");

    // 3) 管理员审核
    await handleMessage(kook, msg(`/cm approve ${ALICE}`, ADMIN));
    assert.equal(findEmployee(ALICE)?.status, "active", "审核后应变 active");

    // 4) 员工先进入语音（任意房间），然后点上班
    handleVoiceEvent(voice("join", ALICE, "ch-lobby", 1_000));
    mock.reset();
    await handleButton(kook, btn("shift:clock-in", ALICE));
    assert.ok(findOpenShift(ALICE), "应该开了一个班");
    const moves = mock.moves();
    assert.equal(moves.length, 1);
    assert.equal(moves[0].targetChannelId, STANDBY, "上班应搬到待命房");
    assert.deepEqual(moves[0].userIds, [ALICE]);

    // 5) 管理员发单 ¥100
    mock.reset();
    await handleMessage(kook, msg(`/cm new ${ROOM_A} 测试单 100`, ADMIN));
    const open = listOpenOrders();
    assert.equal(open.length, 1);
    assert.equal(open[0].price, 100);
    assert.equal(open[0].targetVoiceChannelId, ROOM_A);

    // 6) 员工点接单。我们先模拟员工"还在待命房"
    handleVoiceEvent(voice("leave", ALICE, "ch-lobby", 2_000));
    handleVoiceEvent(voice("join", ALICE, STANDBY, 2_500));

    mock.reset();
    await handleButton(kook, btn(`order:claim:${open[0].orderId}`, ALICE));
    const claimMoves = mock.moves();
    assert.equal(claimMoves.length, 1, "接单应触发一次搬运");
    assert.equal(claimMoves[0].targetChannelId, ROOM_A);
    assert.equal(findOrder(open[0].orderId)?.status, "claimed");
    assert.equal(findOrder(open[0].orderId)?.claimedBy, ALICE);

    // 7) 模拟搬运成功后语音事件（真实环境 KOOK 会自动发，sim 里手动发）
    handleVoiceEvent(voice("leave", ALICE, STANDBY, 3_000));
    handleVoiceEvent(voice("join", ALICE, ROOM_A, 3_100));

    // 8) 完成订单
    mock.reset();
    await handleButton(kook, btn(`order:complete:${open[0].orderId}`, ALICE));
    assert.equal(findOrder(open[0].orderId)?.status, "completed");
    const settlements = listSettlements({ kookUserId: ALICE });
    assert.equal(settlements.length, 1, "应有 1 笔结算");
    assert.equal(settlements[0].amount, 50, "100 * 0.5 默认提成 = 50");

    // 应回执 "已入账 ¥50.00"
    const incomeNotice = mock.texts().find((t) => /已入账/.test(t.content));
    assert.ok(incomeNotice, `应有"已入账"提示。实际：${mock.transcript()}`);

    // 9) 查收益
    mock.reset();
    await handleMessage(kook, msg("/cm income", ALICE));
    const card = mock.cards()[0];
    assert.ok(card, "应回 incomeCard");
    const cardText = JSON.stringify(card.card);
    assert.ok(cardText.includes("50.00"), "卡片里应有 ¥50.00");

    // 10) 下班
    mock.reset();
    await handleButton(kook, btn("shift:clock-out", ALICE));
    assert.equal(findOpenShift(ALICE), null);

    // 打印整段对话便于人工查阅
    if (process.env.SIM_VERBOSE) {
      console.log("\n========= happy path 模拟脚本回放 =========\n" + mock.transcript() + "\n");
    }
  });

  it("员工不在语音房时点接单 → 收到「请先进入语音」提示卡", async () => {
    const mock = new MockKookClient();
    await handleMessage(mock.asClient(), msg("/cm bind", ADMIN));
    await handleMessage(mock.asClient(), msg("/cm bind", ALICE));
    await handleMessage(mock.asClient(), msg(`/cm approve ${ALICE}`, ADMIN));
    await handleMessage(mock.asClient(), msg(`/cm new ${ROOM_A} 测试 50`, ADMIN));
    const order = listOpenOrders()[0];

    mock.reset();
    // Alice 当前没有任何 voice_session（没进过语音）
    await handleButton(mock.asClient(), btn(`order:claim:${order.orderId}`, ALICE));

    assert.equal(mock.moves().length, 0, "不应该尝试搬运");
    assert.equal(findOrder(order.orderId)?.status, "open", "订单应保持 open");
    const card = mock.cards()[0];
    assert.ok(JSON.stringify(card?.card ?? "").includes("请先进入"), "应回提示卡");
  });

  it("时薪计算：开启时薪后下班结算", async () => {
    const { setRule, RULE_KEYS } = await import("../domain/rules.js");
    setRule(RULE_KEYS.HOURLY_RATE, "30");

    const mock = new MockKookClient();
    await handleMessage(mock.asClient(), msg("/cm bind 老板", ADMIN));
    await handleMessage(mock.asClient(), msg("/cm bind 小爱", ALICE));
    await handleMessage(mock.asClient(), msg(`/cm approve ${ALICE}`, ADMIN));

    // 进入语音 + 上班
    handleVoiceEvent(voice("join", ALICE, "ch-lobby", 0));
    mock.reset();
    await handleButton(mock.asClient(), btn("shift:clock-in", ALICE));

    // 假设挂了 2 小时
    handleVoiceEvent(voice("leave", ALICE, "ch-lobby", 2 * 3_600_000));
    handleVoiceEvent(voice("join", ALICE, STANDBY, 2 * 3_600_000));
    handleVoiceEvent(voice("leave", ALICE, STANDBY, 2 * 3_600_000 + 1));

    mock.reset();
    await handleButton(mock.asClient(), btn("shift:clock-out", ALICE));
    const settlements = listSettlements({ kookUserId: ALICE });
    const hourly = settlements.find((s) => s.type === "hourly");
    assert.ok(hourly, "下班应生成时薪结算");
    assert.equal(hourly.amount, 60, "2h × 30 = 60");
  });

  it("订单重复完成不重复入账（幂等保护）", async () => {
    const mock = new MockKookClient();
    await handleMessage(mock.asClient(), msg("/cm bind", ADMIN));
    await handleMessage(mock.asClient(), msg("/cm bind", ALICE));
    await handleMessage(mock.asClient(), msg(`/cm approve ${ALICE}`, ADMIN));
    await handleMessage(mock.asClient(), msg(`/cm new ${ROOM_A} 测试 200`, ADMIN));
    const order = listOpenOrders()[0];

    handleVoiceEvent(voice("join", ALICE, STANDBY, 0));
    await handleButton(mock.asClient(), btn(`order:claim:${order.orderId}`, ALICE));
    await handleButton(mock.asClient(), btn(`order:complete:${order.orderId}`, ALICE));
    // 假设有人重放按钮（KOOK 可能有 retry / 网络抖动）
    await handleButton(mock.asClient(), btn(`order:complete:${order.orderId}`, ALICE));

    const settlements = listSettlements({ kookUserId: ALICE });
    assert.equal(settlements.length, 1, "无论点几次完成，只入账一笔");
    assert.equal(sumAmount(settlements), 100);
  });

  it("非管理员不能发单", async () => {
    const mock = new MockKookClient();
    await handleMessage(mock.asClient(), msg(`/cm bind 路人`, BOB));
    await handleMessage(mock.asClient(), msg(`/cm new ${ROOM_A} 黑产 999`, BOB));
    assert.equal(listOpenOrders().length, 0);
    assert.ok(mock.lastTextContent().includes("仅管理员"), "应回拒绝信息");
  });

  it("非接单人不能完成订单", async () => {
    const mock = new MockKookClient();
    await handleMessage(mock.asClient(), msg("/cm bind", ADMIN));
    await handleMessage(mock.asClient(), msg("/cm bind", ALICE));
    await handleMessage(mock.asClient(), msg("/cm bind", BOB));
    await handleMessage(mock.asClient(), msg(`/cm approve ${ALICE}`, ADMIN));
    await handleMessage(mock.asClient(), msg(`/cm approve ${BOB}`, ADMIN));
    await handleMessage(mock.asClient(), msg(`/cm new ${ROOM_A} 单 100`, ADMIN));
    const order = listOpenOrders()[0];

    handleVoiceEvent(voice("join", ALICE, STANDBY, 0));
    await handleButton(mock.asClient(), btn(`order:claim:${order.orderId}`, ALICE));

    // Bob 来抢着完成
    await handleButton(mock.asClient(), btn(`order:complete:${order.orderId}`, BOB));
    assert.equal(findOrder(order.orderId)?.status, "claimed", "状态不应变");
    assert.equal(listSettlements({ kookUserId: BOB }).length, 0);
  });

  it("语音时长自动累计到当前班次", async () => {
    const mock = new MockKookClient();
    await handleMessage(mock.asClient(), msg("/cm bind", ADMIN));
    await handleMessage(mock.asClient(), msg("/cm bind", ALICE));
    await handleMessage(mock.asClient(), msg(`/cm approve ${ALICE}`, ADMIN));

    handleVoiceEvent(voice("join", ALICE, STANDBY, 0));
    await handleButton(mock.asClient(), btn("shift:clock-in", ALICE));

    // 模拟挂了 30 分钟
    handleVoiceEvent(voice("leave", ALICE, STANDBY, 30 * 60_000));

    const shift = findOpenShift(ALICE);
    assert.equal(shift?.totalVoiceMs, 30 * 60_000);
  });
});
