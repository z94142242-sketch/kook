// 合并后只保留一个 KookClient 实例（位于根 src/kook/client.ts）。
// 这里仅作为别名，让 club-system 内部 import 路径不用动。
export { KookClient } from "../../../../src/kook/client.js";
export type { KookEventHandler, RawKookEvent } from "../../../../src/kook/client.js";
