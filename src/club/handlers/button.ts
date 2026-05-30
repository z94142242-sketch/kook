import { config } from "../../config.js";
import {
  claimOrder,
  completeOrder,
  findOrder,
  listOpenOrders,
  releaseOrder,
  updateOrderCardMessage
} from "../domain/orders.js";
import { findEmployee } from "../domain/employees.js";
import { closeShift, findOpenShift, openShift } from "../domain/shifts.js";
import { attachSessionToOrder, findOpenSession } from "../domain/voice.js";
import { clockResultCard, notInVoiceCard, orderCard } from "../kook/cards.js";
import type { KookClient } from "../../kook/client.js";
import type { KookButtonEvent } from "../../kook/types.js";
import { settleHourlyForShift, settleOrderCommission } from "../services/settlement.js";
import { moveEmployeeToVoice } from "../services/voiceMove.js";

export async function handleButton(kook: KookClient, event: KookButtonEvent) {
  const [domain, action, arg] = event.value.split(":");

  if (domain === "shift") {
    return handleShift(kook, event, action);
  }

  if (domain === "order") {
    if (action === "list") return sendOrders(kook, event.channelId);
    return handleOrder(kook, event, action, arg ?? "");
  }
}

async function handleShift(kook: KookClient, event: KookButtonEvent, action: string) {
  const employee = findEmployee(event.userId);
  if (!employee || employee.status !== "active") {
    await kook.sendCard(event.channelId, clockResultCard({
      title: "未绑定 / 待审核",
      message: "请先使用 `/cm bind <昵称>` 绑定账号，并等待管理员审核。",
      ok: false
    }));
    return;
  }

  if (action === "clock-in") {
    const existing = findOpenShift(employee.kookUserId);
    if (existing) {
      await kook.sendCard(event.channelId, clockResultCard({
        title: "已经在班",
        message: `当前班次开始于 ${formatTime(existing.startedAt)}`,
        ok: false
      }));
      return;
    }
    const shift = openShift(employee.kookUserId, Date.now());
    // 如果用户已经在某个语音里，把后续语音时长挂到这个 shift 上
    const openVoice = findOpenSession(employee.kookUserId);
    if (openVoice && !openVoice.shiftId) {
      // 直接附加：先 close 再 open 一段新的，或者用 update。这里采用 update。
      const { getDb } = await import("../db/database.js");
      getDb().prepare("UPDATE voice_sessions SET shift_id = ? WHERE voice_session_id = ?")
        .run(shift.shiftId, openVoice.voiceSessionId);
    }

    // 把员工拉到待命语音房（如果他已经在某个语音里）
    const moveResult = await moveEmployeeToVoice(kook, employee.kookUserId, config.club.standbyVoiceChannelId);
    const moveNote = moveResult.ok
      ? moveResult.alreadyThere
        ? "你已经在待命房。"
        : "已把你拉到待命语音房。"
      : moveResult.reason === "not_in_voice"
      ? "提示：你还没进入语音频道，请手动进入待命房。"
      : `搬运失败：${moveResult.error ?? "未知原因"}`;

    await kook.sendCard(event.channelId, clockResultCard({
      title: "✅ 上班成功",
      message: `开始时间：${formatTime(shift.startedAt)}\n${moveNote}`,
      ok: true
    }));
    return;
  }

  if (action === "clock-out") {
    const open = findOpenShift(employee.kookUserId);
    if (!open) {
      await kook.sendCard(event.channelId, clockResultCard({
        title: "未在班",
        message: "你当前没有未关闭的班次。",
        ok: false
      }));
      return;
    }
    const closed = closeShift(open.shiftId, Date.now());
    const hourly = closed ? settleHourlyForShift(closed) : null;
    const lines = closed
      ? [
          `本班语音时长：${formatDuration(closed.totalVoiceMs)}`,
          hourly ? `本班时薪结算：¥${hourly.amount.toFixed(2)}` : null
        ].filter(Boolean)
      : ["已下班"];
    await kook.sendCard(event.channelId, clockResultCard({
      title: "✅ 下班成功",
      message: lines.join("\n"),
      ok: true
    }));
  }
}

async function handleOrder(kook: KookClient, event: KookButtonEvent, action: string, orderId: string) {
  const order = findOrder(orderId);
  if (!order) {
    await kook.sendText(event.channelId, "⚠️ 订单不存在");
    return;
  }

  const employee = findEmployee(event.userId);
  if (!employee || employee.status !== "active") {
    await kook.sendText(event.channelId, "⛔ 请先绑定并通过审核");
    return;
  }

  if (action === "claim") {
    if (order.status !== "open") {
      await kook.sendText(event.channelId, `⚠️ 订单状态：${order.status}，无法接单`);
      return;
    }

    // 先确认能搬过去，再改状态，避免接单后人没过去
    const moveResult = await moveEmployeeToVoice(kook, employee.kookUserId, order.targetVoiceChannelId);
    if (!moveResult.ok) {
      if (moveResult.reason === "not_in_voice") {
        await kook.sendCard(event.channelId, notInVoiceCard());
      } else {
        await kook.sendText(event.channelId, `⚠️ 搬运失败：${moveResult.error ?? "未知"}`);
      }
      return;
    }

    const claimed = claimOrder(order.orderId, employee.kookUserId);
    if (!claimed) {
      await kook.sendText(event.channelId, "⚠️ 订单已被他人接走");
      return;
    }

    // 把当前语音 session 关联到这个订单
    const openVoice = findOpenSession(employee.kookUserId);
    if (openVoice) attachSessionToOrder(openVoice.voiceSessionId, claimed.orderId);

    await updateOrderCard(kook, claimed, employee.displayName);
    return;
  }

  if (action === "complete") {
    const done = completeOrder(order.orderId, employee.kookUserId);
    if (!done) {
      await kook.sendText(event.channelId, "⚠️ 只能完成自己接的订单");
      return;
    }
    const settlement = settleOrderCommission(done);
    await updateOrderCard(kook, done, employee.displayName);
    if (settlement) {
      await kook.sendText(
        event.channelId,
        `💰 已入账：¥${settlement.amount.toFixed(2)}（基数 ¥${(settlement.baseAmount ?? 0).toFixed(2)} × ${((settlement.rate ?? 0) * 100).toFixed(0)}%）`
      );
    }
    return;
  }

  if (action === "release") {
    const released = releaseOrder(order.orderId, employee.kookUserId);
    if (!released) {
      await kook.sendText(event.channelId, "⚠️ 只能放弃自己接的订单");
      return;
    }
    await updateOrderCard(kook, released, null);
  }
}

async function sendOrders(kook: KookClient, channelId: string) {
  const orders = listOpenOrders();
  if (orders.length === 0) {
    await kook.sendText(channelId, "暂无待接订单");
    return;
  }
  for (const order of orders) {
    await kook.sendCard(
      channelId,
      orderCard({
        orderId: order.orderId,
        title: order.title,
        customerNote: order.customerNote,
        targetVoiceChannelId: order.targetVoiceChannelId,
        price: order.price,
        status: order.status,
        claimedByName: null
      })
    );
  }
}

async function updateOrderCard(kook: KookClient, order: ReturnType<typeof findOrder>, claimedByName: string | null) {
  if (!order) return;
  const card = orderCard({
    orderId: order.orderId,
    title: order.title,
    customerNote: order.customerNote,
    targetVoiceChannelId: order.targetVoiceChannelId,
    price: order.price,
    status: order.status,
    claimedByName
  });
  if (order.cardMessageId) {
    try {
      await kook.updateCard(order.cardMessageId, card);
      return;
    } catch (err) {
      console.warn(`[order] update card failed orderId=${order.orderId}: ${err instanceof Error ? err.message : err}`);
    }
  }
  const msgId = await kook.sendCard(config.club.commandChannelId, card);
  if (msgId) updateOrderCardMessage(order.orderId, msgId);
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleString("zh-CN", { hour12: false });
}

function formatDuration(ms: number) {
  if (ms <= 0) return "0 分钟";
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} 小时 ${minutes % 60} 分钟` : `${minutes} 分钟`;
}
