// 必须在导入任何业务模块之前设置最小 env，让 config.ts 的 zod 校验通过。
// 注意：合并后 club-system 复用根 config，所以需要同时设置 Codex bridge 的必填字段。
process.env.KOOK_BOT_TOKEN ??= "test-token";
process.env.KOOK_ALLOWED_USER_ID ??= "test-user";
process.env.KOOK_ALLOWED_CHANNEL_ID ??= "test-codex-ch";
process.env.CLUB_ENABLED ??= "true";
process.env.CLUB_GUILD_ID ??= "test-guild";
process.env.CLUB_COMMAND_CHANNEL_ID ??= "ch-cmd";
process.env.CLUB_STANDBY_VOICE_CHANNEL_ID ??= "ch-standby";
process.env.CLUB_ADMIN_USER_IDS ??= "admin1";
process.env.CLUB_DB_PATH ??= ":memory:";
process.env.CLUB_DEV_LOGIN_ENABLED ??= "true";

// 让 better-sqlite3 在 CI 上少打日志
process.env.CI ??= "true";
