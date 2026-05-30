import { randomUUID } from "node:crypto";
import { getDb } from "../db/database.js";

export type VoiceSession = {
  voiceSessionId: string;
  kookUserId: string;
  channelId: string;
  shiftId: string | null;
  orderId: string | null;
  joinedAt: number;
  leftAt: number | null;
  durationMs: number;
};

type Row = {
  voice_session_id: string;
  kook_user_id: string;
  channel_id: string;
  shift_id: string | null;
  order_id: string | null;
  joined_at: number;
  left_at: number | null;
  duration_ms: number;
};

function fromRow(row: Row): VoiceSession {
  return {
    voiceSessionId: row.voice_session_id,
    kookUserId: row.kook_user_id,
    channelId: row.channel_id,
    shiftId: row.shift_id,
    orderId: row.order_id,
    joinedAt: row.joined_at,
    leftAt: row.left_at,
    durationMs: row.duration_ms
  };
}

export function findOpenSession(kookUserId: string): VoiceSession | null {
  const row = getDb()
    .prepare<[string], Row>(
      "SELECT * FROM voice_sessions WHERE kook_user_id = ? AND left_at IS NULL ORDER BY joined_at DESC LIMIT 1"
    )
    .get(kookUserId);
  return row ? fromRow(row) : null;
}

export function recordVoiceJoin(input: {
  kookUserId: string;
  channelId: string;
  at: number;
  shiftId: string | null;
  orderId: string | null;
}): VoiceSession {
  const voiceSessionId = `vs_${randomUUID()}`;
  getDb()
    .prepare(
      `INSERT INTO voice_sessions
       (voice_session_id, kook_user_id, channel_id, shift_id, order_id, joined_at, left_at, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 0)`
    )
    .run(voiceSessionId, input.kookUserId, input.channelId, input.shiftId, input.orderId, input.at);
  return {
    voiceSessionId,
    kookUserId: input.kookUserId,
    channelId: input.channelId,
    shiftId: input.shiftId,
    orderId: input.orderId,
    joinedAt: input.at,
    leftAt: null,
    durationMs: 0
  };
}

export function recordVoiceLeave(kookUserId: string, at: number): VoiceSession | null {
  const open = findOpenSession(kookUserId);
  if (!open) return null;
  const durationMs = Math.max(0, at - open.joinedAt);
  getDb()
    .prepare(
      "UPDATE voice_sessions SET left_at = ?, duration_ms = ? WHERE voice_session_id = ?"
    )
    .run(at, durationMs, open.voiceSessionId);
  return { ...open, leftAt: at, durationMs };
}

export function attachSessionToOrder(voiceSessionId: string, orderId: string) {
  getDb()
    .prepare("UPDATE voice_sessions SET order_id = ? WHERE voice_session_id = ?")
    .run(orderId, voiceSessionId);
}
