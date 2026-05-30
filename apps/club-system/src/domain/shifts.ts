import { randomUUID } from "node:crypto";
import { getDb } from "../db/database.js";

export type ShiftStatus = "open" | "closed";

export type Shift = {
  shiftId: string;
  kookUserId: string;
  startedAt: number;
  endedAt: number | null;
  totalVoiceMs: number;
  status: ShiftStatus;
};

type Row = {
  shift_id: string;
  kook_user_id: string;
  started_at: number;
  ended_at: number | null;
  total_voice_ms: number;
  status: ShiftStatus;
};

function fromRow(row: Row): Shift {
  return {
    shiftId: row.shift_id,
    kookUserId: row.kook_user_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    totalVoiceMs: row.total_voice_ms,
    status: row.status
  };
}

export function findOpenShift(kookUserId: string): Shift | null {
  const row = getDb()
    .prepare<[string], Row>(
      "SELECT * FROM shifts WHERE kook_user_id = ? AND status = 'open' ORDER BY started_at DESC LIMIT 1"
    )
    .get(kookUserId);
  return row ? fromRow(row) : null;
}

export function openShift(kookUserId: string, startedAt: number): Shift {
  const shiftId = `sh_${randomUUID()}`;
  getDb()
    .prepare(
      `INSERT INTO shifts (shift_id, kook_user_id, started_at, ended_at, total_voice_ms, status)
       VALUES (?, ?, ?, NULL, 0, 'open')`
    )
    .run(shiftId, kookUserId, startedAt);
  return {
    shiftId,
    kookUserId,
    startedAt,
    endedAt: null,
    totalVoiceMs: 0,
    status: "open"
  };
}

export function closeShift(shiftId: string, endedAt: number): Shift | null {
  const result = getDb()
    .prepare("UPDATE shifts SET status = 'closed', ended_at = ? WHERE shift_id = ? AND status = 'open'")
    .run(endedAt, shiftId);
  if (result.changes === 0) return null;
  const row = getDb()
    .prepare<[string], Row>("SELECT * FROM shifts WHERE shift_id = ?")
    .get(shiftId);
  return row ? fromRow(row) : null;
}

export function addVoiceTime(shiftId: string, durationMs: number) {
  if (durationMs <= 0) return;
  getDb()
    .prepare("UPDATE shifts SET total_voice_ms = total_voice_ms + ? WHERE shift_id = ?")
    .run(durationMs, shiftId);
}
