import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { config } from "../../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  return initDb(config.club.dbPath);
}

export function initDb(dbPath: string): Database.Database {
  if (dbInstance) dbInstance.close();

  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  if (dbPath !== ":memory:") db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const schemaPath = path.join(__dirname, "schema.sql");
  db.exec(fs.readFileSync(schemaPath, "utf8"));

  dbInstance = db;
  return db;
}

export function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/** 仅供测试使用：丢弃当前连接并重新建一个内存库 */
export function resetDbForTest() {
  closeDb();
  initDb(":memory:");
}
