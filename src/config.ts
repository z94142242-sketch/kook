import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// 启动进程的工作目录 = 仓库根目录（dev 直接跑 tsx；prod 跑 node dist/src/index.js 都从仓库根目录启动）。
export const rootDir = process.cwd();

dotenv.config({ path: path.join(rootDir, ".env"), quiet: true });

// ---- 共享 + Codex bridge ---------------------------------------------------

const baseSchema = z.object({
  KOOK_BOT_TOKEN: z.string().min(1, "KOOK_BOT_TOKEN is required"),
  KOOK_ALLOWED_USER_ID: z.string().min(1, "KOOK_ALLOWED_USER_ID is required"),
  KOOK_ALLOWED_CHANNEL_ID: z.string().min(1, "KOOK_ALLOWED_CHANNEL_ID is required"),
  KOOK_API_BASE: z.string().url().default("https://www.kookapp.cn/api/v3"),
  CODEX_COMMAND_PREFIXES: z.string().default("/codex"),
  CODEX_DEFAULT_PROJECT: z.string().optional(),
  CODEX_APPROVAL_POLICY: z.enum(["on-request", "never"]).default("on-request"),
  CODEX_MAX_CONCURRENT_TASKS: z.coerce.number().int().min(1).max(5).default(1),
  KOOK_MESSAGE_MAX_LENGTH: z.coerce.number().int().min(200).max(4000).default(1800),
  CODEX_TASK_TIMEOUT_MS: z.coerce.number().int().min(10_000).default(10 * 60 * 1000)
});

// ---- Club system（可选）---------------------------------------------------

const clubSchema = z.object({
  CLUB_ENABLED: z.string().default("false"),
  CLUB_GUILD_ID: z.string().default(""),
  CLUB_COMMAND_CHANNEL_ID: z.string().default(""),
  CLUB_STANDBY_VOICE_CHANNEL_ID: z.string().default(""),
  CLUB_ADMIN_USER_IDS: z.string().default(""),
  CLUB_COMMAND_PREFIXES: z.string().default("/club,/cm"),
  CLUB_DB_PATH: z.string().default("./data/club.db"),
  CLUB_HTTP_ENABLED: z.string().default("true"),
  CLUB_HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CLUB_HTTP_HOST: z.string().default("0.0.0.0"),
  CLUB_DEV_LOGIN_ENABLED: z.string().default("false"),
  CLUB_SESSION_TTL_HOURS: z.coerce.number().int().min(1).default(720),
  CLUB_WX_APP_ID: z.string().default(""),
  CLUB_WX_APP_SECRET: z.string().default("")
});

const base = baseSchema.parse(process.env);
const club = clubSchema.parse(process.env);

const clubEnabled = parseBool(club.CLUB_ENABLED, false);

if (clubEnabled) {
  const required = [
    ["CLUB_GUILD_ID", club.CLUB_GUILD_ID],
    ["CLUB_COMMAND_CHANNEL_ID", club.CLUB_COMMAND_CHANNEL_ID],
    ["CLUB_STANDBY_VOICE_CHANNEL_ID", club.CLUB_STANDBY_VOICE_CHANNEL_ID]
  ] as const;
  const missing = required.filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(`CLUB_ENABLED=true 但缺少配置：${missing.join(", ")}`);
  }
}

export type ProjectConfig = {
  cwd: string;
  sandbox: "workspace-write";
  templates?: Record<string, string>;
};

export const config = {
  // ---- 共享 KOOK 连接 -----
  token: base.KOOK_BOT_TOKEN,
  apiBase: base.KOOK_API_BASE.replace(/\/$/, ""),

  // ---- Codex bridge -----
  allowedUserId: base.KOOK_ALLOWED_USER_ID,
  allowedChannelId: base.KOOK_ALLOWED_CHANNEL_ID,
  commandPrefixes: parseCommandPrefixes(base.CODEX_COMMAND_PREFIXES),
  defaultProjectKey: base.CODEX_DEFAULT_PROJECT,
  approvalPolicy: base.CODEX_APPROVAL_POLICY,
  maxConcurrentTasks: base.CODEX_MAX_CONCURRENT_TASKS,
  kookMessageMaxLength: base.KOOK_MESSAGE_MAX_LENGTH,
  codexTaskTimeoutMs: base.CODEX_TASK_TIMEOUT_MS,
  projectsPath: path.join(rootDir, "projects.json"),
  taskStorePath: path.join(rootDir, "data", "tasks.json"),

  // ---- Club system -----
  club: {
    enabled: clubEnabled,
    guildId: club.CLUB_GUILD_ID,
    commandChannelId: club.CLUB_COMMAND_CHANNEL_ID,
    standbyVoiceChannelId: club.CLUB_STANDBY_VOICE_CHANNEL_ID,
    adminUserIds: parseCsv(club.CLUB_ADMIN_USER_IDS),
    commandPrefixes: parseCsv(club.CLUB_COMMAND_PREFIXES, ["/club", "/cm"]),
    dbPath: path.isAbsolute(club.CLUB_DB_PATH)
      ? club.CLUB_DB_PATH
      : path.join(rootDir, club.CLUB_DB_PATH),
    http: {
      enabled: parseBool(club.CLUB_HTTP_ENABLED, true),
      port: club.CLUB_HTTP_PORT,
      host: club.CLUB_HTTP_HOST,
      devLoginEnabled: parseBool(club.CLUB_DEV_LOGIN_ENABLED, false),
      sessionTtlMs: club.CLUB_SESSION_TTL_HOURS * 3_600_000
    },
    wx: {
      appId: club.CLUB_WX_APP_ID,
      appSecret: club.CLUB_WX_APP_SECRET
    }
  }
};

function parseCommandPrefixes(value: string) {
  const prefixes = value
    .split(",")
    .map((prefix) => prefix.trim())
    .filter(Boolean);
  return prefixes.length > 0 ? prefixes : ["/codex"];
}

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
