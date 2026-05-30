import { config } from "./config.js";
import {
  handleCodexButton,
  handleCodexMessage,
  initCodexBridge,
  isCodexButton,
  isCodexMessage
} from "./codex/bridge.js";
import { KookClient } from "./kook/client.js";

async function main() {
  // ---- Codex bridge: always on -------------------------------------------
  await initCodexBridge();

  // ---- Club system: optional, gated by CLUB_ENABLED ----------------------
  let clubRuntime: { shutdown: () => void } | undefined;
  let clubHandlers:
    | typeof import("./club/index.js")
    | undefined;
  if (config.club.enabled) {
    clubHandlers = await import("./club/index.js");
    clubRuntime = clubHandlers.startClubSystem();
  }

  // ---- One KOOK Gateway connection, dispatcher dispatches by channel ----
  let kook!: KookClient;
  kook = new KookClient(async (event) => {
    try {
      if (event.kind === "voice") {
        if (clubHandlers) clubHandlers.handleVoiceEvent(event);
        return;
      }

      if (event.kind === "message") {
        if (isCodexMessage(event)) {
          await handleCodexMessage(kook, event);
          return;
        }
        if (clubHandlers && event.channelId === config.club.commandChannelId) {
          await clubHandlers.handleMessage(kook, event);
        }
        return;
      }

      if (event.kind === "button") {
        if (isCodexButton(event)) {
          await handleCodexButton(kook, event);
          return;
        }
        // Codex 卡片 value 都是 JSON、含 "action"；club 卡片 value 都是 "shift:..." / "order:..." 形式。
        // 这里不强约束频道：club 的按钮可能出现在命令频道或任何被发卡片的频道。
        if (clubHandlers) await clubHandlers.handleButton(kook, event);
      }
    } catch (err) {
      console.error(`[bridge] event handler failed: ${err instanceof Error ? err.message : err}`);
    }
  });

  await kook.connect();
  console.log(`[bridge] kook gateway started${config.club.enabled ? " (codex + club)" : " (codex only)"}`);

  const shutdown = () => {
    kook.close();
    clubRuntime?.shutdown();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(`[bridge] startup failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
