import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { Files } from "./vfs.ts";

export interface Project { id: string; name: string; head: number; createdAt: string }
export interface VersionMeta { seq: number; summary: string; buildOk: boolean; createdAt: string }
export interface Version extends VersionMeta { files: Files; buildLog: string }
export interface Message { id: number; role: "user" | "assistant"; content: string; versionSeq: number | null; createdAt: string }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  head INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS versions (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  files TEXT NOT NULL,
  summary TEXT NOT NULL,
  build_ok INTEGER NOT NULL,
  build_log TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (project_id, seq)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  version_seq INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`;

type Row = Record<string, any>;

export class Store {
  private db: DatabaseSync;

  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    this.db.exec(SCHEMA);
  }

  createProject(name: string): Project {
    const id = randomUUID();
    this.db.prepare("INSERT INTO projects (id, name) VALUES (?, ?)").run(id, name);
    return this.getProject(id)!;
  }

  getProject(id: string): Project | undefined {
    const r = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Row | undefined;
    return r && { id: r.id, name: r.name, head: r.head, createdAt: r.created_at };
  }

  listProjects(): Project[] {
    return (this.db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all() as Row[]).map((r) => ({
      id: r.id, name: r.name, head: r.head, createdAt: r.created_at,
    }));
  }

  renameProject(id: string, name: string) {
    this.db.prepare("UPDATE projects SET name = ? WHERE id = ?").run(name, id);
  }

  deleteProject(id: string) {
    this.db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  }

  /** Snapshot a full file set as the project's next version and move head to it. */
  addVersion(projectId: string, files: Files, summary: string, build: { ok: boolean; log: string }): number {
    const seq = ((this.db.prepare("SELECT MAX(seq) AS m FROM versions WHERE project_id = ?").get(projectId) as Row).m ?? 0) + 1;
    this.db
      .prepare("INSERT INTO versions (project_id, seq, files, summary, build_ok, build_log) VALUES (?, ?, ?, ?, ?, ?)")
      .run(projectId, seq, JSON.stringify(files), summary, build.ok ? 1 : 0, build.log);
    this.db.prepare("UPDATE projects SET head = ? WHERE id = ?").run(seq, projectId);
    return seq;
  }

  getVersion(projectId: string, seq: number): Version | undefined {
    const r = this.db.prepare("SELECT * FROM versions WHERE project_id = ? AND seq = ?").get(projectId, seq) as Row | undefined;
    return r && {
      seq: r.seq, summary: r.summary, buildOk: !!r.build_ok, createdAt: r.created_at,
      files: JSON.parse(r.files), buildLog: r.build_log,
    };
  }

  listVersions(projectId: string): VersionMeta[] {
    return (this.db
      .prepare("SELECT seq, summary, build_ok, created_at FROM versions WHERE project_id = ? ORDER BY seq")
      .all(projectId) as Row[]).map((r) => ({ seq: r.seq, summary: r.summary, buildOk: !!r.build_ok, createdAt: r.created_at }));
  }

  headFiles(projectId: string): Files {
    const p = this.getProject(projectId);
    return (p && this.getVersion(projectId, p.head)?.files) ?? {};
  }

  addMessage(projectId: string, role: Message["role"], content: string, versionSeq: number | null = null) {
    this.db.prepare("INSERT INTO messages (project_id, role, content, version_seq) VALUES (?, ?, ?, ?)")
      .run(projectId, role, content, versionSeq);
  }

  listMessages(projectId: string): Message[] {
    return (this.db.prepare("SELECT * FROM messages WHERE project_id = ? ORDER BY id").all(projectId) as Row[]).map((r) => ({
      id: r.id, role: r.role, content: r.content, versionSeq: r.version_seq, createdAt: r.created_at,
    }));
  }
}
