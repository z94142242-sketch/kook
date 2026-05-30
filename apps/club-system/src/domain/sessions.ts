import { randomBytes } from "node:crypto";
import { config } from "../config.js";
import { getDb } from "../db/database.js";

export type Session = {
  token: string;
  openid: string;
  createdAt: number;
  expiresAt: number;
};

type Row = {
  token: string;
  openid: string;
  created_at: number;
  expires_at: number;
};

function fromRow(row: Row): Session {
  return {
    token: row.token,
    openid: row.openid,
    createdAt: row.created_at,
    expiresAt: row.expires_at
  };
}

export function createSession(openid: string, ttlMs = config.http.sessionTtlMs): Session {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  const expiresAt = now + ttlMs;
  getDb()
    .prepare("INSERT INTO sessions (token, openid, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(token, openid, now, expiresAt);
  return { token, openid, createdAt: now, expiresAt };
}

export function findSession(token: string): Session | null {
  const row = getDb()
    .prepare<[string], Row>("SELECT * FROM sessions WHERE token = ?")
    .get(token);
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    revokeSession(token);
    return null;
  }
  return fromRow(row);
}

export function revokeSession(token: string): void {
  getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function revokeAllSessions(openid: string): void {
  getDb().prepare("DELETE FROM sessions WHERE openid = ?").run(openid);
}

export function purgeExpiredSessions(): number {
  const result = getDb()
    .prepare("DELETE FROM sessions WHERE expires_at < ?")
    .run(Date.now());
  return result.changes;
}
