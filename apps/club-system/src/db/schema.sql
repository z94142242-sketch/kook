-- 员工账号：KOOK 用户绑定到俱乐部
CREATE TABLE IF NOT EXISTS employees (
  kook_user_id   TEXT PRIMARY KEY,
  display_name   TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'employee', -- employee | manager | admin
  status         TEXT NOT NULL DEFAULT 'pending',  -- pending | active | suspended
  bound_at       INTEGER NOT NULL,
  approved_at    INTEGER,
  approved_by    TEXT
);

-- 班次：一次完整的上班 → 下班
CREATE TABLE IF NOT EXISTS shifts (
  shift_id       TEXT PRIMARY KEY,
  kook_user_id   TEXT NOT NULL,
  started_at     INTEGER NOT NULL,
  ended_at       INTEGER,
  total_voice_ms INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'open',     -- open | closed
  FOREIGN KEY (kook_user_id) REFERENCES employees(kook_user_id)
);
CREATE INDEX IF NOT EXISTS idx_shifts_user_open ON shifts(kook_user_id, status);

-- 语音会话：每一段独立的「进入语音 → 退出语音」原子事件
CREATE TABLE IF NOT EXISTS voice_sessions (
  voice_session_id TEXT PRIMARY KEY,
  kook_user_id     TEXT NOT NULL,
  channel_id       TEXT NOT NULL,
  shift_id         TEXT,
  order_id         TEXT,
  joined_at        INTEGER NOT NULL,
  left_at          INTEGER,
  duration_ms      INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (kook_user_id) REFERENCES employees(kook_user_id)
);
CREATE INDEX IF NOT EXISTS idx_voice_user_open ON voice_sessions(kook_user_id, left_at);

-- 订单：客户下单，员工接单
CREATE TABLE IF NOT EXISTS orders (
  order_id              TEXT PRIMARY KEY,
  title                 TEXT NOT NULL,
  customer_note         TEXT,
  target_voice_channel  TEXT NOT NULL,
  price                 REAL NOT NULL DEFAULT 0,
  commission_rate       REAL,  -- NULL 表示用全局默认
  status                TEXT NOT NULL DEFAULT 'open', -- open | claimed | completed | cancelled
  claimed_by            TEXT,
  claimed_at            INTEGER,
  completed_at          INTEGER,
  created_at            INTEGER NOT NULL,
  created_by            TEXT NOT NULL,
  card_message_id       TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_claimed_by ON orders(claimed_by, status);

-- 结算记录：员工每一笔收益的明细
CREATE TABLE IF NOT EXISTS settlements (
  settlement_id TEXT PRIMARY KEY,
  kook_user_id  TEXT NOT NULL,
  order_id      TEXT,
  shift_id      TEXT,
  type          TEXT NOT NULL,  -- order_commission | hourly | bonus | adjustment
  amount        REAL NOT NULL,  -- 员工实际入账金额（元）
  base_amount   REAL,           -- 计算基数（订单价或工时小时数）
  rate          REAL,           -- 提成比例或时薪
  note          TEXT,
  created_at    INTEGER NOT NULL,
  FOREIGN KEY (kook_user_id) REFERENCES employees(kook_user_id)
);
CREATE INDEX IF NOT EXISTS idx_settlements_user ON settlements(kook_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_settlements_shift ON settlements(shift_id);
CREATE INDEX IF NOT EXISTS idx_settlements_order ON settlements(order_id);

-- 规则：在线可调的 KV 配置
CREATE TABLE IF NOT EXISTS rules (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);
