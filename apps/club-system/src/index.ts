import { serve, type ServerType } from "@hono/node-server";
import { config } from "./config.js";
import { closeDb, getDb } from "./db/database.js";
import { purgeExpiredSessions } from "./domain/sessions.js";
import { handleButton } from "./handlers/button.js";
import { handleMessage } from "./handlers/message.js";
import { handleVoiceEvent } from "./handlers/voiceEvent.js";
import { buildHttpApp } from "./http/server.js";
import { KookClient } from "./kook/client.js";

async function main() {
  // 初始化数据库（建表）
  getDb();
  console.log(`[club] db ready at ${config.dbPath}`);

  // KOOK Gateway 长连接 worker
  let kook!: KookClient;
  kook = new KookClient(async (event) => {
    try {
      if (event.kind === "message") await handleMessage(kook, event);
      else if (event.kind === "button") await handleButton(kook, event);
      else if (event.kind === "voice") handleVoiceEvent(event);
    } catch (err) {
      console.error(`[club] handler failed: ${err instanceof Error ? err.message : err}`);
    }
  });
  await kook.connect();
  console.log("[club] kook client started");

  // HTTP API（给小程序调用）
  let httpServer: ServerType | undefined;
  if (config.http.enabled) {
    httpServer = serve({
      fetch: buildHttpApp().fetch,
      hostname: config.http.host,
      port: config.http.port
    });
    console.log(`[club] http api listening on ${config.http.host}:${config.http.port}`);
  }

  // 每天清理过期 session
  const cleanupTimer = setInterval(() => {
    const cleaned = purgeExpiredSessions();
    if (cleaned > 0) console.log(`[club] purged ${cleaned} expired sessions`);
  }, 24 * 3_600_000);

  const shutdown = () => {
    clearInterval(cleanupTimer);
    kook.close();
    httpServer?.close();
    closeDb();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(`[club] startup failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
