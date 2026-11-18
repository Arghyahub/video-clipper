import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { Job } from "./types.js";

export class JobStore {
  private db: Database.Database;
  constructor(file = path.resolve("data/clip-studio.db")) { fs.mkdirSync(path.dirname(file), { recursive: true }); this.db = new Database(file); this.db.exec("CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, value TEXT NOT NULL)"); }
  save(job: Job) { this.db.prepare("INSERT INTO jobs(id,value) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value").run(job.id, JSON.stringify(job)); return job; }
  get(id: string) { const row = this.db.prepare("SELECT value FROM jobs WHERE id=?").get(id) as { value: string } | undefined; return row && JSON.parse(row.value) as Job; }
  list() { return (this.db.prepare("SELECT value FROM jobs ORDER BY rowid DESC").all() as { value: string }[]).map((r) => JSON.parse(r.value) as Job); }
}
