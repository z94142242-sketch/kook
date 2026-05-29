import { config } from "./config.js";
import { getDb, closeDb } from "./db/database.js";
import { KookClient } from "./kook/client.js";
import { handleButton } from "./handlers/button.js";
import { handleMessage } from "./handlers/message.js";
import { handleVoiceEvent } from "./handlers/voiceEvent.js";

async function main() {
  // 初始化数据库（建表）
  getDb();
  console.log(`[club] db ready at ${config.dbPath}`);

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

  const shutdown = () => {
    kook.close();
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
