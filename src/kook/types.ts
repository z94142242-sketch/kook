// 共享的 KOOK Gateway 事件类型。Codex bridge 与 club-system 都用这套。

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
