import { randomUUID } from "node:crypto";
import { getDb } from "../db/database.js";

export type SettlementType = "order_commission" | "hourly" | "bonus" | "adjustment";

export type Settlement = {
  settlementId: string;
  kookUserId: string;
  orderId: string | null;
  shiftId: string | null;
  type: SettlementType;
  amount: number;
  baseAmount: number | null;
  rate: number | null;
  note: string | null;
  createdAt: number;
};

type Row = {
  settlement_id: string;
  kook_user_id: string;
  order_id: string | null;
  shift_id: string | null;
  type: SettlementType;
  amount: number;
  base_amount: number | null;
  rate: number | null;
  note: string | null;
  created_at: number;
};

function fromRow(row: Row): Settlement {
  return {
    settlementId: row.settlement_id,
    kookUserId: row.kook_user_id,
    orderId: row.order_id,
    shiftId: row.shift_id,
    type: row.type,
    amount: row.amount,
    baseAmount: row.base_amount,
    rate: row.rate,
    note: row.note,
    createdAt: row.created_at
  };
}

export function createSettlement(input: {
  kookUserId: string;
  type: SettlementType;
  amount: number;
  orderId?: string | null;
  shiftId?: string | null;
  baseAmount?: number | null;
  rate?: number | null;
  note?: string | null;
}): Settlement {
  const settlementId = `set_${randomUUID()}`;
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO settlements
         (settlement_id, kook_user_id, order_id, shift_id, type, amount, base_amount, rate, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      settlementId,
      input.kookUserId,
      input.orderId ?? null,
      input.shiftId ?? null,
      input.type,
      round2(input.amount),
      input.baseAmount ?? null,
      input.rate ?? null,
      input.note ?? null,
      now
    );
  return getSettlement(settlementId)!;
}

export function getSettlement(settlementId: string): Settlement | null {
  const row = getDb()
    .prepare<[string], Row>("SELECT * FROM settlements WHERE settlement_id = ?")
    .get(settlementId);
  return row ? fromRow(row) : null;
}

export function listSettlements(input: {
  kookUserId: string;
  since?: number;
  until?: number;
  shiftId?: string;
}): Settlement[] {
  const where: string[] = ["kook_user_id = ?"];
  const params: unknown[] = [input.kookUserId];
  if (input.since !== undefined) {
    where.push("created_at >= ?");
    params.push(input.since);
  }
  if (input.until !== undefined) {
    where.push("created_at < ?");
    params.push(input.until);
  }
  if (input.shiftId) {
    where.push("shift_id = ?");
    params.push(input.shiftId);
  }
  const sql = `SELECT * FROM settlements WHERE ${where.join(" AND ")} ORDER BY created_at DESC`;
  return getDb().prepare<unknown[], Row>(sql).all(...params).map(fromRow);
}

export function sumAmount(settlements: Settlement[]): number {
  return round2(settlements.reduce((acc, s) => acc + s.amount, 0));
}

/** 是否已经为这个订单出过提成结算（防重复入账） */
export function hasOrderCommission(orderId: string): boolean {
  const row = getDb()
    .prepare<[string], { c: number }>(
      "SELECT COUNT(*) AS c FROM settlements WHERE order_id = ? AND type = 'order_commission'"
    )
    .get(orderId);
  return (row?.c ?? 0) > 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
