import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(rootDir, ".env"), quiet: true });

const envSchema = z.object({
  KOOK_BOT_TOKEN: z.string().min(1, "KOOK_BOT_TOKEN is required"),
  KOOK_ALLOWED_USER_ID: z.string().min(1, "KOOK_ALLOWED_USER_ID is required"),
  KOOK_ALLOWED_CHANNEL_ID: z.string().min(1, "KOOK_ALLOWED_CHANNEL_ID is required"),
  KOOK_API_BASE: z.string().url().default("https://www.kookapp.cn/api/v3"),
  CODEX_APPROVAL_POLICY: z.enum(["on-request", "never"]).default("on-request"),
  CODEX_MAX_CONCURRENT_TASKS: z.coerce.number().int().min(1).max(5).default(1),
  KOOK_MESSAGE_MAX_LENGTH: z.coerce.number().int().min(200).max(4000).default(1800),
  CODEX_TASK_TIMEOUT_MS: z.coerce.number().int().min(10_000).default(10 * 60 * 1000)
});

const env = envSchema.parse(process.env);

export type ProjectConfig = {
  cwd: string;
  sandbox: "workspace-write";
  templates?: Record<string, string>;
};

export const config = {
  token: env.KOOK_BOT_TOKEN,
  allowedUserId: env.KOOK_ALLOWED_USER_ID,
  allowedChannelId: env.KOOK_ALLOWED_CHANNEL_ID,
  apiBase: env.KOOK_API_BASE.replace(/\/$/, ""),
  approvalPolicy: env.CODEX_APPROVAL_POLICY,
  maxConcurrentTasks: env.CODEX_MAX_CONCURRENT_TASKS,
  kookMessageMaxLength: env.KOOK_MESSAGE_MAX_LENGTH,
  codexTaskTimeoutMs: env.CODEX_TASK_TIMEOUT_MS,
  projectsPath: path.join(rootDir, "projects.json"),
  taskStorePath: path.join(rootDir, "data", "tasks.json")
};
