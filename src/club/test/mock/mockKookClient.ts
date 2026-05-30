// 模拟 KOOK 客户端：记录所有「机器人本会发出去」的调用，便于断言。
// 形状对齐 KookClient，但不连任何网络。
import type { KookClient } from "../../../kook/client.js";

export type RecordedCall =
  | { type: "sendText"; channelId: string; content: string }
  | { type: "sendCard"; channelId: string; card: unknown[]; msgId: string }
  | { type: "updateCard"; msgId: string; card: unknown[] }
  | { type: "moveUserToVoice"; targetChannelId: string; userIds: string[] };

export class MockKookClient {
  calls: RecordedCall[] = [];
  moveShouldFail = false;
  private counter = 0;

  async sendText(channelId: string, content: string) {
    this.calls.push({ type: "sendText", channelId, content });
    return { msg_id: this.nextId() };
  }

  async sendCard(channelId: string, card: unknown[]) {
    const msgId = this.nextId();
    this.calls.push({ type: "sendCard", channelId, card, msgId });
    return msgId;
  }

  async updateCard(msgId: string, card: unknown[]) {
    this.calls.push({ type: "updateCard", msgId, card });
  }

  async moveUserToVoice(targetChannelId: string, userIds: string[]) {
    if (this.moveShouldFail) throw new Error("mock: move failed");
    this.calls.push({ type: "moveUserToVoice", targetChannelId, userIds });
  }

  asClient(): KookClient {
    return this as unknown as KookClient;
  }

  reset() {
    this.calls = [];
    this.moveShouldFail = false;
  }

  // ---- 查询助手 ----

  texts() {
    return this.calls.filter((c): c is RecordedCall & { type: "sendText" } => c.type === "sendText");
  }

  cards() {
    return this.calls.filter((c): c is RecordedCall & { type: "sendCard" } => c.type === "sendCard");
  }

  updates() {
    return this.calls.filter((c): c is RecordedCall & { type: "updateCard" } => c.type === "updateCard");
  }

  moves() {
    return this.calls.filter(
      (c): c is RecordedCall & { type: "moveUserToVoice" } => c.type === "moveUserToVoice"
    );
  }

  lastTextContent(): string {
    const t = this.texts();
    return t[t.length - 1]?.content ?? "";
  }

  /** 把所有调用转成给人看的「机器人回放」 */
  transcript(): string {
    return this.calls
      .map((c) => {
        switch (c.type) {
          case "sendText":
            return `📤 [文本→${c.channelId}] ${oneLine(c.content)}`;
          case "sendCard":
            return `📤 [卡片→${c.channelId}] ${cardHeader(c.card)} (msgId=${c.msgId})`;
          case "updateCard":
            return `🔄 [更新卡片 msgId=${c.msgId}] ${cardHeader(c.card)}`;
          case "moveUserToVoice":
            return `🎙️ [搬运] users=${c.userIds.join(",")} → ${c.targetChannelId}`;
        }
      })
      .join("\n");
  }

  private nextId() {
    this.counter += 1;
    return `mock_msg_${this.counter}`;
  }
}

function oneLine(s: string) {
  return s.replace(/\s+/g, " ").slice(0, 120);
}

function cardHeader(card: unknown[]): string {
  try {
    const first = card[0] as { modules?: Array<{ type: string; text?: { content?: string } }> };
    const header = first?.modules?.find((m) => m.type === "header");
    return oneLine(header?.text?.content ?? "(card)");
  } catch {
    return "(card)";
  }
}
