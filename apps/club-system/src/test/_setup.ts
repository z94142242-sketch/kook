// 必须在导入任何业务模块之前设置最小 env，让 config.ts 的 zod 校验通过
process.env.CLUB_KOOK_BOT_TOKEN ??= "test-token";
process.env.CLUB_GUILD_ID ??= "test-guild";
process.env.CLUB_COMMAND_CHANNEL_ID ??= "ch-cmd";
process.env.CLUB_STANDBY_VOICE_CHANNEL_ID ??= "ch-standby";
process.env.CLUB_ADMIN_USER_IDS ??= "admin1";
process.env.CLUB_DB_PATH ??= ":memory:";

// 让 better-sqlite3 在 CI 上少打日志
process.env.CI ??= "true";
