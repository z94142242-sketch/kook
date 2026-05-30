import { Order } from "../domain/orders.js";
import { getDefaultCommissionRate, getHourlyRate } from "../domain/rules.js";
import { Shift } from "../domain/shifts.js";
import {
  createSettlement,
  hasOrderCommission,
  Settlement
} from "../domain/settlements.js";

/**
 * 订单完成时计算并写入员工提成。
 * 幂等：若该订单已结算过，直接返回 null（防止重复入账）。
 */
export function settleOrderCommission(order: Order): Settlement | null {
  if (order.status !== "completed") return null;
  if (!order.claimedBy) return null;
  if (hasOrderCommission(order.orderId)) return null;

  const rate = order.commissionRate ?? getDefaultCommissionRate();
  const amount = order.price * rate;
  if (amount <= 0) return null;

  return createSettlement({
    kookUserId: order.claimedBy,
    type: "order_commission",
    orderId: order.orderId,
    amount,
    baseAmount: order.price,
    rate,
    note: order.title
  });
}

/**
 * 班次结束时按时薪结算（如果配置了时薪）。
 */
export function settleHourlyForShift(shift: Shift): Settlement | null {
  if (shift.status !== "closed") return null;
  const hourlyRate = getHourlyRate();
  if (hourlyRate <= 0) return null;

  const hours = shift.totalVoiceMs / 3_600_000;
  const amount = hours * hourlyRate;
  if (amount <= 0) return null;

  return createSettlement({
    kookUserId: shift.kookUserId,
    type: "hourly",
    shiftId: shift.shiftId,
    amount,
    baseAmount: hours,
    rate: hourlyRate,
    note: `本班语音时长结算`
  });
}
