/**
 * 沙盒演示：跑一遍完整业务流（绑定 → 上班 → 接单搬运 → 完成入账 → 查收益 → 下班），
 * 把"机器人会发出去的所有消息"和"状态变化"打印出来。
 *
 * 用 `npm run sim` 启动。不连接真 KOOK，全程在内存里。
 */
import "./_setup.js";
import { resetDbForTest } from "../db/database.js";
import { handleButton } from "../handlers/button.js";
import { handleMessage } from "../handlers/message.js";
import { handleVoiceEvent } from "../handlers/voiceEvent.js";
import type { KookButtonEvent, KookMessageEvent, KookVoiceEvent } from "../kook/types.js";
import { findOpenShift } from "../domain/shifts.js";
import { listOpenOrders } from "../domain/orders.js";
import { listSettlements, sumAmount } from "../domain/settlements.js";
import { MockKookClient } from "./mock/mockKookClient.js";

const ADMIN = "admin1";
const ALICE = "alice";
const CMD_CH = "ch-cmd";
const STANDBY = "ch-standby";
const ROOM_A = "ch-customer-A";

const STEP_PADDING = 2;
let stepCounter = 0;

const mock = new MockKookClient();
const kook = mock.asClient();

function step(title: string) {
  stepCounter += 1;
  const header = `\n[${stepCounter.toString().padStart(STEP_PADDING, "0")}] ${title}`;
  console.log("─".repeat(70));
  console.log(header);
  console.log("─".repeat(70));
  mock.reset();
}

function flush() {
  const t = mock.transcript();
  if (t) console.log(t);
}

function msg(content: string, authorId: string): KookMessageEvent {
  return {
    kind: "message",
    channelId: CMD_CH,
    authorId,
    authorName: authorId,
    content,
    msgId: `m_${stepCounter}`,
    raw: {}
  };
}

function btn(value: string, userId: string): KookButtonEvent {
  return { kind: "button", channelId: CMD_CH, userId, userName: userId, value, msgId: "b", raw: {} };
}

function voice(state: "join" | "leave", userId: string, channelId: string, at: number): KookVoiceEvent {
  return { kind: "voice", state, userId, channelId, at, raw: {} };
}

async function main() {
  resetDbForTest();

  console.log("\n🚀 KOOK 俱乐部管理系统 - 沙盒演示");
  console.log("演员：");
  console.log(`  ${ADMIN}  = 工作室老板（管理员）`);
  console.log(`  ${ALICE}  = 普通员工`);

  step(`${ADMIN} 发 "/cm bind 老板" — 自动通过（admin 身份）`);
  await handleMessage(kook, msg("/cm bind 老板", ADMIN));
  flush();

  step(`${ALICE} 发 "/cm bind 小爱" — 进入 pending`);
  await handleMessage(kook, msg("/cm bind 小爱", ALICE));
  flush();

  step(`${ADMIN} 审核：/cm approve ${ALICE}`);
  await handleMessage(kook, msg(`/cm approve ${ALICE}`, ADMIN));
  flush();

  step(`${ALICE} 加入语音 ch-lobby（KOOK Gateway 推过来一个 voice join 事件）`);
  handleVoiceEvent(voice("join", ALICE, "ch-lobby", 1_000));
  console.log("(无回复，但内部 voice_session 已记录)");

  step(`${ALICE} 点「上班打卡」按钮`);
  await handleButton(kook, btn("shift:clock-in", ALICE));
  flush();

  step(`${ADMIN} 发 "/cm new ${ROOM_A} 陪打30分钟 100" — 发布订单 ¥100`);
  await handleMessage(kook, msg(`/cm new ${ROOM_A} 陪打30分钟 100`, ADMIN));
  flush();

  step(`(模拟搬运后 ${ALICE} 实际人在待命房)`);
  handleVoiceEvent(voice("leave", ALICE, "ch-lobby", 2_000));
  handleVoiceEvent(voice("join", ALICE, STANDBY, 2_500));
  console.log("(同步内部 voice_session 状态)");

  step(`${ALICE} 点「接单并进入房间」`);
  const order = listOpenOrders()[0];
  await handleButton(kook, btn(`order:claim:${order.orderId}`, ALICE));
  flush();

  step(`(KOOK 触发搬运后的 voice 事件回到我们这边)`);
  handleVoiceEvent(voice("leave", ALICE, STANDBY, 3_000));
  handleVoiceEvent(voice("join", ALICE, ROOM_A, 3_100));
  console.log("(订单 voice_session 已附加)");

  step(`${ALICE} 服务完成，点「完成订单」`);
  await handleButton(kook, btn(`order:complete:${order.orderId}`, ALICE));
  flush();

  step(`${ALICE} 发 "/cm income" 查看收益`);
  await handleMessage(kook, msg("/cm income", ALICE));
  flush();

  step(`${ALICE} 点「下班打卡」`);
  await handleButton(kook, btn("shift:clock-out", ALICE));
  flush();

  console.log("\n" + "═".repeat(70));
  console.log("📊 演示结束 — DB 最终状态：");
  console.log("═".repeat(70));
  const settlements = listSettlements({ kookUserId: ALICE });
  console.log(`Alice 入账记录：${settlements.length} 笔`);
  settlements.forEach((s) => {
    console.log(`  - [${s.type}] ¥${s.amount.toFixed(2)} 备注=${s.note ?? "(无)"}`);
  });
  console.log(`Alice 总收益：¥${sumAmount(settlements).toFixed(2)}`);
  console.log(`Alice 当前班次：${findOpenShift(ALICE) ? "上班中" : "已下班"}`);
  console.log("");
}

main().catch((err) => {
  console.error("演示失败：", err);
  process.exit(1);
});
