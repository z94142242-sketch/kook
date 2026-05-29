import { addVoiceTime, findOpenShift } from "../domain/shifts.js";
import { findOpenSession, recordVoiceJoin, recordVoiceLeave } from "../domain/voice.js";
import { findEmployee } from "../domain/employees.js";
import type { KookVoiceEvent } from "../kook/types.js";

export function handleVoiceEvent(event: KookVoiceEvent) {
  const employee = findEmployee(event.userId);
  if (!employee || employee.status !== "active") return;

  if (event.state === "join") {
    // 如果存在未关闭的旧 session（脏数据），先关一下避免重叠
    const open = findOpenSession(event.userId);
    if (open) recordVoiceLeave(event.userId, event.at);

    const shift = findOpenShift(event.userId);
    recordVoiceJoin({
      kookUserId: event.userId,
      channelId: event.channelId,
      at: event.at,
      shiftId: shift?.shiftId ?? null,
      orderId: null
    });
    return;
  }

  // leave
  const closed = recordVoiceLeave(event.userId, event.at);
  if (closed && closed.shiftId) {
    addVoiceTime(closed.shiftId, closed.durationMs);
  }
}
