import { getDb } from "../db/database.js";

export type EmployeeRole = "employee" | "manager" | "admin";
export type EmployeeStatus = "pending" | "active" | "suspended";

export type Employee = {
  kookUserId: string;
  displayName: string;
  role: EmployeeRole;
  status: EmployeeStatus;
  boundAt: number;
  approvedAt: number | null;
  approvedBy: string | null;
};

type Row = {
  kook_user_id: string;
  display_name: string;
  role: EmployeeRole;
  status: EmployeeStatus;
  bound_at: number;
  approved_at: number | null;
  approved_by: string | null;
};

function fromRow(row: Row): Employee {
  return {
    kookUserId: row.kook_user_id,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    boundAt: row.bound_at,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by
  };
}

export function findEmployee(kookUserId: string): Employee | null {
  const row = getDb()
    .prepare<[string], Row>("SELECT * FROM employees WHERE kook_user_id = ?")
    .get(kookUserId);
  return row ? fromRow(row) : null;
}

export function listEmployees(status?: EmployeeStatus): Employee[] {
  const db = getDb();
  const rows = status
    ? db.prepare<[string], Row>("SELECT * FROM employees WHERE status = ? ORDER BY bound_at DESC").all(status)
    : db.prepare<[], Row>("SELECT * FROM employees ORDER BY bound_at DESC").all();
  return rows.map(fromRow);
}

export function bindEmployee(input: {
  kookUserId: string;
  displayName: string;
  autoApprove?: boolean;
}): Employee {
  const now = Date.now();
  const existing = findEmployee(input.kookUserId);
  if (existing) return existing;

  const status: EmployeeStatus = input.autoApprove ? "active" : "pending";
  getDb()
    .prepare(
      `INSERT INTO employees (kook_user_id, display_name, role, status, bound_at, approved_at, approved_by)
       VALUES (?, ?, 'employee', ?, ?, ?, ?)`
    )
    .run(
      input.kookUserId,
      input.displayName,
      status,
      now,
      input.autoApprove ? now : null,
      input.autoApprove ? "system" : null
    );
  return findEmployee(input.kookUserId)!;
}

export function approveEmployee(kookUserId: string, approvedBy: string): Employee | null {
  const now = Date.now();
  const result = getDb()
    .prepare(
      `UPDATE employees SET status = 'active', approved_at = ?, approved_by = ?
       WHERE kook_user_id = ? AND status = 'pending'`
    )
    .run(now, approvedBy, kookUserId);
  if (result.changes === 0) return null;
  return findEmployee(kookUserId);
}
