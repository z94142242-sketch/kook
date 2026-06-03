import zlib from "node:zlib";
import WebSocket from "ws";
import { config } from "../config.js";
import type { KookSystemEvent } from "./types.js";

type KookEnvelope<T> = { code: number; message?: string; data: T };

type GatewayPayload = {
  s: number;
  sn?: number;
  d?: Record<string, unknown>;
};

export type RawKookEvent = {
  channel_type?: string;
  type?: number;
  target_id?: string;
  author_id?: string;
  content?: string;
  msg_id?: string;
  extra?: {
    type?: string | number;
    author?: { id?: string; username?: string; nickname?: string; bot?: boolean };
    body?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type KookEventHandler = (event: KookSystemEvent) => Promise<void> | void;

const HEARTBEAT_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 6_000;
const MAX_RECONNECT_DELAY_MS = 60_000;
const SEEN_LIMIT = 500;

const SYSTEM_EVENT_VOICE_JOIN = "joined_channel";
const SYSTEM_EVENT_VOICE_LEAVE = "exited_channel";

export class KookClient {
  private ws?: WebSocket;
  private sessionId?: string;
  private lastSn = 0;
  private heartbeat?: NodeJS.Timeout;
  private pongTimeout?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private intentionalClose = false;
  private seenMessageIds: string[] = [];
  private seenMessageIdSet = new Set<string>();

  constructor(private readonly onEvent: KookEventHandler) {}

  async connect() {
    this.intentionalClose = false;
    try {
      await this.open(false);
    } catch (err) {
      console.error("[kook] initial connect failed: " + toSafeMessage(err));
      this.reconnect(false);
    }
  }

  close() {
    this.intentionalClose = true;
    this.cleanupTimers();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }

  async sendText(channelId: string, content: string) {
    return this.request<{ msg_id?: string }>("/message/create", {
      type: 1,
      target_id: channelId,
      content
    });
  }

  async sendCard(channelId: string, card: unknown[]) {
    const result = await this.request<{ msg_id?: string }>("/message/create", {
      type: 10,
      target_id: channelId,
      content: JSON.stringify(card)
    });
    return result.msg_id;
  }

  async updateCard(msgId: string, card: unknown[]) {
    await this.request("/message/update", {
      msg_id: msgId,
      type: 10,
      content: JSON.stringify(card)
    });
  }

  async moveUserToVoice(targetChannelId: string, userIds: string[]) {
    if (userIds.length === 0) return;
    await this.request("/channel/move-user", {
      target_id: targetChannelId,
      user_ids: userIds
    });
  }

  private async open(resume: boolean) {
    const gateway = await this.request<{ url: string }>("/gateway/index", { compress: 0 }, "GET");
    const url = this.withResumeParams(gateway.url, resume);
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on("open", () => console.log("[kook] gateway connecting"));

    ws.on("message", (data) => {
      void this.handleGatewayMessage(ws, data).catch((err) => {
        console.error(`[kook] gateway message failed: ${toSafeMessage(err)}`);
        this.reconnect(Boolean(this.sessionId));
      });
    });

    ws.on("close", () => {
      this.cleanupTimers();
      if (this.intentionalClose) return;
      console.warn("[kook] gateway closed");
      this.reconnect(Boolean(this.sessionId));
    });

    ws.on("error", (err) => {
      console.error(`[kook] gateway error: ${err.message}`);
      this.reconnect(Boolean(this.sessionId));
    });
  }

  private async handleGatewayMessage(ws: WebSocket, data: WebSocket.RawData) {
    if (this.ws !== ws) return;
    const payload = parseGatewayPayload(data);

    if (payload.s === 1) {
      const hello = payload.d as { code?: number; session_id?: string } | undefined;
      if (hello?.code !== undefined && hello.code !== 0) {
        throw new Error(`Gateway hello failed: ${hello.code}`);
      }
      this.sessionId = String(hello?.session_id ?? "");
      this.reconnectAttempts = 0;
      this.startHeartbeat(ws);
      console.log("[kook] gateway online");
      return;
    }

    if (payload.s === 0) {
      if (typeof payload.sn === "number") this.lastSn = payload.sn;
      const raw = payload.d as RawKookEvent;
      if (raw?.extra?.author?.bot) return;
      if (raw?.msg_id && this.markSeen(raw.msg_id) === false) return;

      const event = mapEvent(raw);
      if (event) await this.onEvent(event);
      return;
    }

    if (payload.s === 3) {
      this.clearPongTimeout();
      return;
    }

    if (payload.s === 5) {
      this.sessionId = undefined;
      this.lastSn = 0;
      this.reconnect(false);
    }
  }

  private markSeen(msgId: string) {
    if (this.seenMessageIdSet.has(msgId)) return false;
    this.seenMessageIdSet.add(msgId);
    this.seenMessageIds.push(msgId);
    while (this.seenMessageIds.length > SEEN_LIMIT) {
      const oldest = this.seenMessageIds.shift();
      if (oldest) this.seenMessageIdSet.delete(oldest);
    }
    return true;
  }

  private startHeartbeat(ws: WebSocket) {
    this.cleanupTimers();
    const ping = () => {
      if (this.ws !== ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ s: 2, sn: this.lastSn }));
      this.clearPongTimeout();
      this.pongTimeout = setTimeout(() => {
        console.warn("[kook] heartbeat timeout");
        this.reconnect(Boolean(this.sessionId));
      }, PONG_TIMEOUT_MS);
    };
    this.heartbeat = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    ping();
  }

  private reconnect(resume: boolean) {
    if (this.intentionalClose || this.reconnectTimer) return;
    this.cleanupTimers();
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) this.ws.close();

    const delay = Math.min(2 ** Math.min(this.reconnectAttempts, 5) * 1000, MAX_RECONNECT_DELAY_MS);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.open(resume && Boolean(this.sessionId)).catch((err) => {
        console.error(`[kook] reconnect failed: ${toSafeMessage(err)}`);
        this.reconnect(false);
      });
    }, delay);
  }

  private cleanupTimers() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    this.clearPongTimeout();
  }

  private clearPongTimeout() {
    if (this.pongTimeout) clearTimeout(this.pongTimeout);
    this.pongTimeout = undefined;
  }

  private withResumeParams(gatewayUrl: string, resume: boolean) {
    if (!resume || !this.sessionId) return gatewayUrl;
    const url = new URL(gatewayUrl);
    url.searchParams.set("resume", "1");
    url.searchParams.set("sn", String(this.lastSn));
    url.searchParams.set("session_id", this.sessionId);
    return url.toString();
  }

  private async request<T>(
    path: string,
    bodyOrQuery?: Record<string, unknown>,
    method: "GET" | "POST" = "POST"
  ): Promise<T> {
    const url = new URL(`${config.apiBase}${path}`);
    const headers: Record<string, string> = {
      Authorization: `Bot ${config.token}`,
      "Accept-Language": "zh-CN"
    };
    const init: RequestInit = { method, headers };

    if (method === "GET") {
      for (const [key, value] of Object.entries(bodyOrQuery ?? {})) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    } else {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(bodyOrQuery ?? {});
    }

    const response = await fetch(url, init);
    const text = await response.text();
    const parsed = text ? (JSON.parse(text) as KookEnvelope<T>) : { code: 0, data: {} as T };
    if (!response.ok || parsed.code !== 0) {
      throw new Error(parsed.message || `KOOK API request failed: ${path}`);
    }
    return parsed.data;
  }
}

function mapEvent(raw: RawKookEvent): KookSystemEvent | null {
  if (!raw) return null;

  const extra = raw.extra ?? {};
  const isButton = extra.type === "message_btn_click" || extra.body?.value !== undefined;

  if (isButton) {
    const body = extra.body ?? {};
    const userInfo = body.user_info as { id?: unknown; username?: unknown } | undefined;
    const userId =
      pickString(body.user_id) ?? pickString(body.userId) ?? pickString(userInfo?.id) ?? raw.author_id;
    const channelId = pickString(body.channel_id) ?? pickString(body.channelId) ?? raw.target_id;
    const value = pickString(body.value);
    if (!userId || !channelId || value === undefined) return null;
    return {
      kind: "button",
      channelId,
      userId,
      userName: pickString(userInfo?.username) ?? pickString(extra.author?.nickname) ?? userId,
      value,
      msgId: raw.msg_id ?? "",
      raw
    };
  }

  if (raw.type === 255 && typeof extra.type === "string") {
    if (extra.type === SYSTEM_EVENT_VOICE_JOIN || extra.type === SYSTEM_EVENT_VOICE_LEAVE) {
      const body = (extra.body ?? {}) as Record<string, unknown>;
      const userId = pickString(body.user_id);
      const channelId = pickString(body.channel_id);
      if (!userId || !channelId) return null;
      return {
        kind: "voice",
        userId,
        channelId,
        state: extra.type === SYSTEM_EVENT_VOICE_JOIN ? "join" : "leave",
        at: Date.now(),
        raw
      };
    }
    return null;
  }

  if (typeof raw.content === "string" && raw.target_id && raw.author_id) {
    return {
      kind: "message",
      channelId: raw.target_id,
      authorId: raw.author_id,
      authorName: pickString(extra.author?.nickname) ?? pickString(extra.author?.username) ?? raw.author_id,
      content: raw.content,
      msgId: raw.msg_id ?? "",
      raw
    };
  }

  return null;
}

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseGatewayPayload(data: WebSocket.RawData): GatewayPayload {
  const buffers = Array.isArray(data) ? data : [data];
  const buffer = Buffer.concat(buffers.map((item) => (Buffer.isBuffer(item) ? item : Buffer.from(item))));
  try {
    return JSON.parse(buffer.toString("utf8")) as GatewayPayload;
  } catch {
    for (const inflate of [zlib.inflateSync, zlib.inflateRawSync]) {
      try {
        return JSON.parse(inflate(buffer).toString("utf8")) as GatewayPayload;
      } catch {
        // try next variant
      }
    }
  }
  throw new Error("Invalid KOOK Gateway payload");
}

function toSafeMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}
