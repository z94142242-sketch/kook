import { config } from "../../config.js";
import { bindEmployee, approveEmployee, findEmployee, listEmployees } from "../domain/employees.js";
import { createOrder, listOpenOrders } from "../domain/orders.js";
import type { KookClient } from "../../kook/client.js";
import type { KookMessageEvent } from "../../kook/types.js";
import { homeCard, incomeCard, orderCard } from "../kook/cards.js";
import { findOpenShift } from "../domain/shifts.js";
import { RULE_KEYS, getDefaultCommissionRate, getHourlyRate, listRules, setRule } from "../domain/rules.js";
import { listSettlements, sumAmount } from "../domain/settlements.js";

const HELP = [
  "可用命令：",
  "`/cm` 或 `/club` 显示工作台",
  "`/cm bind <昵称>` 绑定账号（首次使用）",
  "`/cm orders` 查看待接订单",
  "`/cm income` 查看本人收益",
  "管理员：",
  "`/cm approve <kook_user_id>` 通过审核",
  "`/cm staff` 列出员工",
  "`/cm new <频道ID> <标题> [金额] [备注]` 发布订单",
  "`/cm rate` 查看规则",
  "`/cm rate commission <0~1>` 设置默认提成比例",
  "`/cm rate hourly <元/小时>` 设置时薪（0 表示不按时薪结算）",
  "`/cm income <kook_user_id>` 查看他人收益"
].join("\n");

export async function handleMessage(kook: KookClient, event: KookMessageEvent) {
  if (event.channelId !== config.club.commandChannelId) return;

  const command = parseCommand(event.content);
  if (!command) return;

  const isAdmin = config.club.adminUserIds.includes(event.authorId);

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
    const [channelId, title, priceArg, ...rest] = command.args;
    if (!channelId || !title) {
      await kook.sendText(event.channelId, "用法：`/cm new <频道ID> <标题> [金额] [备注]`");
      return;
    }
    const parsedPrice = priceArg !== undefined ? Number(priceArg) : NaN;
    const isPriceToken = priceArg !== undefined && Number.isFinite(parsedPrice);
    const price = isPriceToken ? Math.max(0, parsedPrice) : 0;
    const note = (isPriceToken ? rest : [priceArg, ...rest].filter((x) => x !== undefined)).join(" ");
    const order = createOrder({
      title,
      customerNote: note || null,
      targetVoiceChannelId: channelId,
      price,
      createdBy: event.authorId
    });
    const msgId = await kook.sendCard(
      event.channelId,
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
    if (msgId) {
      const { updateOrderCardMessage } = await import("../domain/orders.js");
      updateOrderCardMessage(order.orderId, msgId);
    }
    return;
  }

  if (command.action === "rate") {
    if (!isAdmin) {
      await kook.sendText(event.channelId, "⛔ 仅管理员可用");
      return;
    }
    const [sub, valueArg] = command.args;
    if (!sub) {
      const lines = listRules().map(
        (r) => `- ${r.key} = ${r.value}${r.isDefault ? "（默认）" : ""}`
      );
      const summary = [
        "当前规则：",
        ...lines,
        "",
        `默认提成：${(getDefaultCommissionRate() * 100).toFixed(0)}%`,
        `时薪：¥${getHourlyRate().toFixed(2)}/小时${getHourlyRate() === 0 ? "（关闭）" : ""}`
      ];
      await kook.sendText(event.channelId, summary.join("\n"));
      return;
    }
    if (sub === "commission") {
      const value = Number(valueArg);
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        await kook.sendText(event.channelId, "提成比例需为 0~1 的数字");
        return;
      }
      setRule(RULE_KEYS.DEFAULT_COMMISSION_RATE, String(value), event.authorId);
      await kook.sendText(event.channelId, `✅ 默认提成比例 → ${(value * 100).toFixed(0)}%`);
      return;
    }
    if (sub === "hourly") {
      const value = Number(valueArg);
      if (!Number.isFinite(value) || value < 0) {
        await kook.sendText(event.channelId, "时薪需为 ≥0 的数字");
        return;
      }
      setRule(RULE_KEYS.HOURLY_RATE, String(value), event.authorId);
      await kook.sendText(event.channelId, `✅ 时薪 → ¥${value.toFixed(2)}/小时${value === 0 ? "（已关闭）" : ""}`);
      return;
    }
    await kook.sendText(event.channelId, "用法：`/cm rate` 或 `/cm rate commission <0~1>` 或 `/cm rate hourly <元>`");
    return;
  }

  if (command.action === "income") {
    const targetId = command.args[0];
    if (targetId && !isAdmin && targetId !== event.authorId) {
      await kook.sendText(event.channelId, "⛔ 仅管理员可查他人收益");
      return;
    }
    const userId = targetId ?? event.authorId;
    const employee = findEmployee(userId);
    if (!employee) {
      await kook.sendText(event.channelId, "⚠️ 该用户未绑定");
      return;
    }
    await sendIncome(kook, event.channelId, employee.kookUserId, employee.displayName);
    return;
  }

  await kook.sendText(event.channelId, HELP);
}

async function sendIncome(kook: KookClient, channelId: string, userId: string, displayName: string) {
  const now = Date.now();
  const dayStart = startOfDay(now);
  const monthStart = startOfMonth(now);

  const today = listSettlements({ kookUserId: userId, since: dayStart });
  const month = listSettlements({ kookUserId: userId, since: monthStart });
  const openShift = findOpenShift(userId);
  const shift = openShift ? listSettlements({ kookUserId: userId, shiftId: openShift.shiftId }) : [];

  await kook.sendCard(
    channelId,
    incomeCard({
      displayName,
      todayTotal: sumAmount(today),
      monthTotal: sumAmount(month),
      shiftTotal: sumAmount(shift),
      recent: today.slice(0, 5)
    })
  );
}

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfMonth(ts: number) {
  const d = new Date(ts);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
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
    config.club.commandChannelId,
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
        price: order.price,
        status: order.status,
        claimedByName: null
      })
    );
  }
}

type ParsedCommand = { action: string; args: string[] };

function parseCommand(content: string): ParsedCommand | null {
  const trimmed = content.trim();
  const prefix = config.club.commandPrefixes.find((p) => trimmed === p || trimmed.startsWith(`${p} `));
  if (!prefix) return null;
  const rest = trimmed.slice(prefix.length).trim();
  if (!rest) return { action: "home", args: [] };
  const tokens = rest.split(/\s+/);
  const action = (tokens.shift() ?? "").toLowerCase();
  return { action: action || "home", args: tokens };
}
