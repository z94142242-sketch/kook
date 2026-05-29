import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(rootDir, ".env"), quiet: true });

const envSchema = z.object({
  CLUB_KOOK_BOT_TOKEN: z.string().min(1, "CLUB_KOOK_BOT_TOKEN is required"),
  CLUB_KOOK_API_BASE: z.string().url().default("https://www.kookapp.cn/api/v3"),
  CLUB_GUILD_ID: z.string().min(1, "CLUB_GUILD_ID is required"),
  CLUB_COMMAND_CHANNEL_ID: z.string().min(1, "CLUB_COMMAND_CHANNEL_ID is required"),
  CLUB_STANDBY_VOICE_CHANNEL_ID: z.string().min(1, "CLUB_STANDBY_VOICE_CHANNEL_ID is required"),
  CLUB_ADMIN_USER_IDS: z.string().default(""),
  CLUB_COMMAND_PREFIXES: z.string().default("/club,/cm"),
  CLUB_DB_PATH: z.string().default("./data/club.db")
});

const env = envSchema.parse(process.env);

export const config = {
  token: env.CLUB_KOOK_BOT_TOKEN,
  apiBase: env.CLUB_KOOK_API_BASE.replace(/\/$/, ""),
  guildId: env.CLUB_GUILD_ID,
  commandChannelId: env.CLUB_COMMAND_CHANNEL_ID,
  standbyVoiceChannelId: env.CLUB_STANDBY_VOICE_CHANNEL_ID,
  adminUserIds: parseCsv(env.CLUB_ADMIN_USER_IDS),
  commandPrefixes: parseCsv(env.CLUB_COMMAND_PREFIXES, ["/club", "/cm"]),
  dbPath: path.isAbsolute(env.CLUB_DB_PATH) ? env.CLUB_DB_PATH : path.join(rootDir, env.CLUB_DB_PATH)
};

function parseCsv(value: string, fallback: string[] = []) {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
}
