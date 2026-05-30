// club-system 已合并到根进程：本文件不再 main()，而是导出初始化函数 + 三个事件 handler，
// 由根目录 src/index.ts 调用。
import { serve, type ServerType } from "@hono/node-server";
import { config } from "./config.js";
import { closeDb, getDb } from "./db/database.js";
import { purgeExpiredSessions } from "./domain/sessions.js";
import { buildHttpApp } from "./http/server.js";

export { handleButton } from "./handlers/button.js";
export { handleMessage } from "./handlers/message.js";
export { handleVoiceEvent } from "./handlers/voiceEvent.js";
export { config as clubConfig } from "./config.js";

export type ClubRuntime = {
  httpServer?: ServerType;
  cleanupTimer: NodeJS.Timeout;
  shutdown: () => void;
};

/**
 * 初始化 club-system：建数据库、启动小程序 HTTP API、起定时清理。
 * 返回的 runtime 由根进程负责在 SIGINT/SIGTERM 时调用 shutdown。
 *
 * KOOK Gateway 事件由根进程统一接收后按频道分发到本模块的 handler。
 */
export function startClubSystem(): ClubRuntime {
  getDb();
  console.log(`[club] db ready at ${config.dbPath}`);

  let httpServer: ServerType | undefined;
  if (config.http.enabled) {
    httpServer = serve({
      fetch: buildHttpApp().fetch,
      hostname: config.http.host,
      port: config.http.port
    });
    console.log(`[club] http api listening on ${config.http.host}:${config.http.port}`);
  }

  const cleanupTimer = setInterval(() => {
    const cleaned = purgeExpiredSessions();
    if (cleaned > 0) console.log(`[club] purged ${cleaned} expired sessions`);
  }, 24 * 3_600_000);

  const shutdown = () => {
    clearInterval(cleanupTimer);
    httpServer?.close();
    closeDb();
  };

  return { httpServer, cleanupTimer, shutdown };
}
