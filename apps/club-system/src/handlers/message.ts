import { config } from "../config.js";
import { bindEmployee, approveEmployee, findEmployee, listEmployees } from "../domain/employees.js";
import { createOrder, listOpenOrders } from "../domain/orders.js";
import type { KookClient } from "../kook/client.js";
import type { KookMessageEvent } from "../kook/types.js";
import { homeCard, orderCard } from "../kook/cards.js";
import { findOpenShift } from "../domain/shifts.js";

const HELP = [
  "可用命令：",
  "`/cm` 或 `/club` 显示工作台",
  "`/cm bind <昵称>` 绑定账号（首次使用）",
  "`/cm orders` 查看待接订单",
  "管理员：",
  "`/cm approve <kook_user_id>` 通过审核",
  "`/cm staff` 列出员工",
  "`/cm new <频道ID> <标题> [备注]` 发布订单"
].join("\n");

export async function handleMessage(kook: KookClient, event: KookMessageEvent) {
  if (event.channelId !== config.commandChannelId) return;

  const command = parseCommand(event.content);
  if (!command) return;

  const isAdmin = config.adminUserIds.includes(event.authorId);

  if (command.action === "help" || command.action === "home") {
    await sendHome(kook, event.authorId, event.authorName);
    return;
  }

  if (command.action === "bind") {
    const displayName = command.args[0] || event.authorName;
    bindEmployee({
      kookUserId: event.authorId,
      displayName,
      autoApprove: isAdmin
    });
    await kook.sendText(
      event.channelId,
      isAdmin
        ? `✅ 已绑定并自动审核：${displayName}`
        : `✅ 已提交绑定申请：${displayName}，请联系管理员审核。`
    );
    return;
  }

  if (command.action === "orders") {
    await sendOrderList(kook, event.channelId);
    return;
  }

  if (command.action === "approve") {
    if (!isAdmin) {
      await kook.sendText(event.channelId, "⛔ 仅管理员可用");
      return;
    }
    const targetId = command.args[0];
    if (!targetId) {
      await kook.sendText(event.channelId, "用法：`/cm approve <kook_user_id>`");
      return;
    }
    const approved = approveEmployee(targetId, event.authorId);
    await kook.sendText(
      event.channelId,
      approved ? `✅ 已审核：${approved.displayName}` : "⚠️ 未找到该 pending 员工"
    );
    return;
  }

  if (command.action === "staff") {
    if (!isAdmin) {
      await kook.sendText(event.channelId, "⛔ 仅管理员可用");
      return;
    }
    const all = listEmployees();
    if (all.length === 0) {
      await kook.sendText(event.channelId, "暂无员工");
      return;
    }
    const lines = all.map((e) => `- [${e.status}] ${e.displayName} (${e.kookUserId}) · ${e.role}`);
    await kook.sendText(event.channelId, lines.join("\n"));
    return;
  }

  if (command.action === "new") {
    if (!isAdmin) {
      await kook.sendText(event.channelId, "⛔ 仅管理员可发单");
      return;
    }
    const [channelId, title, ...rest] = command.args;
    if (!channelId || !title) {
      await kook.sendText(event.channelId, "用法：`/cm new <频道ID> <标题> [备注]`");
      return;
    }
    const order = createOrder({
      title,
      customerNote: rest.join(" ") || null,
      targetVoiceChannelId: channelId,
      createdBy: event.authorId
    });
    const msgId = await kook.sendCard(
      event.channelId,
      orderCard({
        orderId: order.orderId,
        title: order.title,
        customerNote: order.customerNote,
        targetVoiceChannelId: order.targetVoiceChannelId,
        status: order.status,
        claimedByName: null
      })
    );
    if (msgId) {
      const { updateOrderCardMessage } = await import("../domain/orders.js");
      updateOrderCardMessage(order.orderId, msgId);
    }
    return;
  }

  await kook.sendText(event.channelId, HELP);
}

async function sendHome(kook: KookClient, userId: string, fallbackName: string) {
  const employee = findEmployee(userId);
  const displayName = employee?.displayName ?? fallbackName;
  const status = employee
    ? employee.status === "active"
      ? findOpenShift(employee.kookUserId)
        ? "上班中"
        : "已下班"
      : `状态：${employee.status}`
    : "未绑定";
  const onlineMs = employee ? findOpenShift(employee.kookUserId)?.totalVoiceMs ?? 0 : 0;
  await kook.sendCard(
    config.commandChannelId,
    homeCard({
      displayName,
      status,
      onlineMs,
      openOrders: listOpenOrders().length
    })
  );
}

async function sendOrderList(kook: KookClient, channelId: string) {
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
        status: order.status,
        claimedByName: null
      })
    );
  }
}

type ParsedCommand = { action: string; args: string[] };

function parseCommand(content: string): ParsedCommand | null {
  const trimmed = content.trim();
  const prefix = config.commandPrefixes.find((p) => trimmed === p || trimmed.startsWith(`${p} `));
  if (!prefix) return null;
  const rest = trimmed.slice(prefix.length).trim();
  if (!rest) return { action: "home", args: [] };
  const tokens = rest.split(/\s+/);
  const action = (tokens.shift() ?? "").toLowerCase();
  return { action: action || "home", args: tokens };
}
