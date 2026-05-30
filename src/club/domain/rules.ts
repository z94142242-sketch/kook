import { getDb } from "../db/database.js";

export const RULE_KEYS = {
  DEFAULT_COMMISSION_RATE: "default_commission_rate",
  HOURLY_RATE: "hourly_rate"
} as const;

export type RuleKey = (typeof RULE_KEYS)[keyof typeof RULE_KEYS];

const DEFAULTS: Record<RuleKey, string> = {
  [RULE_KEYS.DEFAULT_COMMISSION_RATE]: "0.5", // 默认提成 50%
  [RULE_KEYS.HOURLY_RATE]: "0" // 0 = 不按时薪结算
};

type Row = { key: string; value: string; updated_at: number; updated_by: string | null };

function getRaw(key: string): string | null {
  const row = getDb()
    .prepare<[string], Row>("SELECT * FROM rules WHERE key = ?")
    .get(key);
  return row ? row.value : null;
}

function getNumber(key: RuleKey): number {
  const raw = getRaw(key) ?? DEFAULTS[key];
  const value = Number(raw);
  return Number.isFinite(value) ? value : Number(DEFAULTS[key]);
}

export function getDefaultCommissionRate(): number {
  return clampRate(getNumber(RULE_KEYS.DEFAULT_COMMISSION_RATE));
}

export function getHourlyRate(): number {
  return Math.max(0, getNumber(RULE_KEYS.HOURLY_RATE));
}

export function setRule(key: RuleKey, value: string, updatedBy: string | null = null) {
  getDb()
    .prepare(
      `INSERT INTO rules (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    )
    .run(key, value, Date.now(), updatedBy);
}

export function listRules(): Array<{ key: RuleKey; value: string; isDefault: boolean }> {
  return (Object.values(RULE_KEYS) as RuleKey[]).map((key) => {
    const stored = getRaw(key);
    return {
      key,
      value: stored ?? DEFAULTS[key],
      isDefault: stored === null
    };
  });
}

function clampRate(value: number): number {
  if (!Number.isFinite(value)) return Number(DEFAULTS[RULE_KEYS.DEFAULT_COMMISSION_RATE]);
  return Math.min(1, Math.max(0, value));
}
