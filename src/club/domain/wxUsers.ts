import { getDb } from "../db/database.js";

export type WxUser = {
  openid: string;
  unionid: string | null;
  kookUserId: string | null;
  createdAt: number;
};

type Row = {
  openid: string;
  unionid: string | null;
  kook_user_id: string | null;
  created_at: number;
};

function fromRow(row: Row): WxUser {
  return {
    openid: row.openid,
    unionid: row.unionid,
    kookUserId: row.kook_user_id,
    createdAt: row.created_at
  };
}

export function findWxUser(openid: string): WxUser | null {
  const row = getDb()
    .prepare<[string], Row>("SELECT * FROM wx_users WHERE openid = ?")
    .get(openid);
  return row ? fromRow(row) : null;
}

export function findWxUserByKook(kookUserId: string): WxUser | null {
  const row = getDb()
    .prepare<[string], Row>("SELECT * FROM wx_users WHERE kook_user_id = ?")
    .get(kookUserId);
  return row ? fromRow(row) : null;
}

export function upsertWxUser(input: { openid: string; unionid?: string | null }): WxUser {
  const existing = findWxUser(input.openid);
  if (existing) {
    if (input.unionid && input.unionid !== existing.unionid) {
      getDb()
        .prepare("UPDATE wx_users SET unionid = ? WHERE openid = ?")
        .run(input.unionid, input.openid);
      return { ...existing, unionid: input.unionid };
    }
    return existing;
  }
  getDb()
    .prepare(
      "INSERT INTO wx_users (openid, unionid, kook_user_id, created_at) VALUES (?, ?, NULL, ?)"
    )
    .run(input.openid, input.unionid ?? null, Date.now());
  return findWxUser(input.openid)!;
}

export function bindKookToWxUser(openid: string, kookUserId: string): WxUser | null {
  // 一个 KOOK 账号最多被一个微信账号绑定
  const previous = findWxUserByKook(kookUserId);
  if (previous && previous.openid !== openid) return null;

  const result = getDb()
    .prepare("UPDATE wx_users SET kook_user_id = ? WHERE openid = ?")
    .run(kookUserId, openid);
  if (result.changes === 0) return null;
  return findWxUser(openid);
}

export function unbindKookFromWxUser(openid: string): void {
  getDb().prepare("UPDATE wx_users SET kook_user_id = NULL WHERE openid = ?").run(openid);
}
