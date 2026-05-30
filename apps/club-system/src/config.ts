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
  CLUB_DB_PATH: z.string().default("./data/club.db"),

  // HTTP API（给小程序调用）
  CLUB_HTTP_ENABLED: z.string().default("true"),
  CLUB_HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CLUB_HTTP_HOST: z.string().default("0.0.0.0"),
  CLUB_DEV_LOGIN_ENABLED: z.string().default("false"),
  CLUB_SESSION_TTL_HOURS: z.coerce.number().int().min(1).default(720),

  // 微信小程序
  CLUB_WX_APP_ID: z.string().default(""),
  CLUB_WX_APP_SECRET: z.string().default("")
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
  dbPath: path.isAbsolute(env.CLUB_DB_PATH) ? env.CLUB_DB_PATH : path.join(rootDir, env.CLUB_DB_PATH),
  http: {
    enabled: parseBool(env.CLUB_HTTP_ENABLED, true),
    port: env.CLUB_HTTP_PORT,
    host: env.CLUB_HTTP_HOST,
    devLoginEnabled: parseBool(env.CLUB_DEV_LOGIN_ENABLED, false),
    sessionTtlMs: env.CLUB_SESSION_TTL_HOURS * 3_600_000
  },
  wx: {
    appId: env.CLUB_WX_APP_ID,
    appSecret: env.CLUB_WX_APP_SECRET
  }
};

function parseBool(value: string, fallback: boolean) {
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
}

function parseCsv(value: string, fallback: string[] = []) {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
}
