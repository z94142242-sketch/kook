// KOOK Gateway 事件中我们关心的形状。
// 完整事件还有更多字段，这里只列服务用得到的部分。

export type KookAuthor = {
  id?: string;
  username?: string;
  nickname?: string;
  bot?: boolean;
};

export type KookMessageEvent = {
  kind: "message";
  channelId: string;
  authorId: string;
  authorName: string;
  content: string;
  msgId: string;
  raw: unknown;
};

export type KookButtonEvent = {
  kind: "button";
  channelId: string;
  userId: string;
  userName: string;
  value: string;
  msgId: string;
  raw: unknown;
};

export type KookVoiceEvent = {
  kind: "voice";
  userId: string;
  channelId: string;
  state: "join" | "leave";
  at: number;
  raw: unknown;
};

export type KookSystemEvent = KookMessageEvent | KookButtonEvent | KookVoiceEvent;
