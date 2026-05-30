import { randomUUID } from "node:crypto";
import { getDb } from "../db/database.js";

export type OrderStatus = "open" | "claimed" | "completed" | "cancelled";

export type Order = {
  orderId: string;
  title: string;
  customerNote: string | null;
  targetVoiceChannelId: string;
  price: number;
  commissionRate: number | null;
  status: OrderStatus;
  claimedBy: string | null;
  claimedAt: number | null;
  completedAt: number | null;
  createdAt: number;
  createdBy: string;
  cardMessageId: string | null;
};

type Row = {
  order_id: string;
  title: string;
  customer_note: string | null;
  target_voice_channel: string;
  price: number;
  commission_rate: number | null;
  status: OrderStatus;
  claimed_by: string | null;
  claimed_at: number | null;
  completed_at: number | null;
  created_at: number;
  created_by: string;
  card_message_id: string | null;
};

function fromRow(row: Row): Order {
  return {
    orderId: row.order_id,
    title: row.title,
    customerNote: row.customer_note,
    targetVoiceChannelId: row.target_voice_channel,
    price: row.price,
    commissionRate: row.commission_rate,
    status: row.status,
    claimedBy: row.claimed_by,
    claimedAt: row.claimed_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
    cardMessageId: row.card_message_id
  };
}

export function findOrder(orderId: string): Order | null {
  const row = getDb()
    .prepare<[string], Row>("SELECT * FROM orders WHERE order_id = ?")
    .get(orderId);
  return row ? fromRow(row) : null;
}

export function listOpenOrders(): Order[] {
  return getDb()
    .prepare<[], Row>("SELECT * FROM orders WHERE status = 'open' ORDER BY created_at ASC")
    .all()
    .map(fromRow);
}

export function createOrder(input: {
  title: string;
  customerNote?: string | null;
  targetVoiceChannelId: string;
  price?: number;
  commissionRate?: number | null;
  createdBy: string;
}): Order {
  const orderId = `ord_${randomUUID()}`;
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO orders
         (order_id, title, customer_note, target_voice_channel, price, commission_rate, status, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)`
    )
    .run(
      orderId,
      input.title,
      input.customerNote ?? null,
      input.targetVoiceChannelId,
      input.price ?? 0,
      input.commissionRate ?? null,
      now,
      input.createdBy
    );
  return findOrder(orderId)!;
}

export function claimOrder(orderId: string, kookUserId: string): Order | null {
  const now = Date.now();
  const result = getDb()
    .prepare(
      `UPDATE orders SET status = 'claimed', claimed_by = ?, claimed_at = ?
       WHERE order_id = ? AND status = 'open'`
    )
    .run(kookUserId, now, orderId);
  if (result.changes === 0) return null;
  return findOrder(orderId);
}

export function completeOrder(orderId: string, kookUserId: string): Order | null {
  const now = Date.now();
  const result = getDb()
    .prepare(
      `UPDATE orders SET status = 'completed', completed_at = ?
       WHERE order_id = ? AND status = 'claimed' AND claimed_by = ?`
    )
    .run(now, orderId, kookUserId);
  if (result.changes === 0) return null;
  return findOrder(orderId);
}

export function releaseOrder(orderId: string, kookUserId: string): Order | null {
  const result = getDb()
    .prepare(
      `UPDATE orders SET status = 'open', claimed_by = NULL, claimed_at = NULL
       WHERE order_id = ? AND status = 'claimed' AND claimed_by = ?`
    )
    .run(orderId, kookUserId);
  if (result.changes === 0) return null;
  return findOrder(orderId);
}

export function updateOrderCardMessage(orderId: string, msgId: string | null) {
  getDb().prepare("UPDATE orders SET card_message_id = ? WHERE order_id = ?").run(msgId, orderId);
}
