import type { KookClient } from "../kook/client.js";
import { findOpenSession } from "../domain/voice.js";

export type MoveResult =
  | { ok: true; fromChannelId: string; alreadyThere: boolean }
  | { ok: false; reason: "not_in_voice" | "move_failed"; error?: string };

/**
 * 原子操作：把员工搬运到目标语音频道。
 * 前置：员工必须已经在某个语音频道里（KOOK 官方限制）。
 * 我们通过本地的 voice_sessions 状态来快速判断，避免每次都打 KOOK API。
 */
export async function moveEmployeeToVoice(
  kook: KookClient,
  kookUserId: string,
  targetChannelId: string
): Promise<MoveResult> {
  const open = findOpenSession(kookUserId);
  if (!open) return { ok: false, reason: "not_in_voice" };

  if (open.channelId === targetChannelId) {
    return { ok: true, fromChannelId: targetChannelId, alreadyThere: true };
  }

  try {
    await kook.moveUserToVoice(targetChannelId, [kookUserId]);
    return { ok: true, fromChannelId: open.channelId, alreadyThere: false };
  } catch (err) {
    return {
      ok: false,
      reason: "move_failed",
      error: err instanceof Error ? err.message : String(err)
    };
  }
}
