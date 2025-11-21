import { structuredPatch } from "diff";
import type { Files } from "./vfs.ts";
import type { Store } from "./db.ts";

export interface FileDiff {
  path: string;
  status: "added" | "removed" | "modified";
  hunks: { oldStart: number; newStart: number; lines: string[] }[];
}

/** Per-file unified diff between two snapshots. Unchanged files are omitted. */
export function diffFiles(before: Files, after: Files): FileDiff[] {
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const out: FileDiff[] = [];
  for (const path of paths) {
    const a = before[path];
    const b = after[path];
    if (a === b) continue;
    const status = a === undefined ? "added" : b === undefined ? "removed" : "modified";
    const patch = structuredPatch(path, path, a ?? "", b ?? "", "", "", { context: 3 });
    out.push({
      path,
      status,
      hunks: patch.hunks.map((h) => ({ oldStart: h.oldStart, newStart: h.newStart, lines: h.lines })),
    });
  }
  return out;
}

/** Diff of version `seq` against the one before it (empty project for v1). */
export function versionDiff(store: Store, projectId: string, seq: number): FileDiff[] {
  const cur = store.getVersion(projectId, seq);
  if (!cur) throw new Error(`version ${seq} not found`);
  const prev = seq > 1 ? store.getVersion(projectId, seq - 1)?.files ?? {} : {};
  return diffFiles(prev, cur.files);
}

/**
 * Restore never rewrites history: it appends a new version carrying the old
 * files, so the restore itself can be undone.
 */
export function restoreVersion(store: Store, projectId: string, seq: number, build: { ok: boolean; log: string }): number {
  const v = store.getVersion(projectId, seq);
  if (!v) throw new Error(`version ${seq} not found`);
  return store.addVersion(projectId, v.files, `Restored v${seq}`, build);
}
