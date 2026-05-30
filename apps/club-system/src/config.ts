// club-system 的 config 现在只是把合并后的根 config 重新整形，
// 保留原有 API（config.token、config.commandChannelId 等）不变，
// 这样 handlers/domain/services 里的代码不需要任何改动。
//
// KOOK Bot Token / API base 与 Codex bridge 共享一个连接（同一个 Bot）。

import { config as root, rootDir as sharedRootDir } from "../../../src/config.js";

if (!root.club.enabled) {
  // 这是配置类错误：合并模式下 root 已经验证过 CLUB_ENABLED=true 时的必填字段。
  // 走到这里说明有人在 club-system 模块被引入时却没开 CLUB_ENABLED，是 bug。
  throw new Error("club-system imported but CLUB_ENABLED is not true");
}

export const config = {
  token: root.token,
  apiBase: root.apiBase,
  guildId: root.club.guildId,
  commandChannelId: root.club.commandChannelId,
  standbyVoiceChannelId: root.club.standbyVoiceChannelId,
  adminUserIds: root.club.adminUserIds,
  commandPrefixes: root.club.commandPrefixes,
  dbPath: root.club.dbPath,
  http: root.club.http,
  wx: root.club.wx
};

export const rootDir = sharedRootDir;
