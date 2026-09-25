import { describe, expect, it } from "vitest";
import { Store } from "../server/db.ts";
import { diffFiles, restoreVersion, versionDiff } from "../server/versions.ts";

const ok = { ok: true, log: "" };

describe("diffFiles", () => {
  it("reports added, removed and modified files with hunks", () => {
    const d = diffFiles(
      { "a.ts": "one\ntwo\n", "gone.ts": "x\n", "same.ts": "s\n" },
      { "a.ts": "one\nTWO\n", "new.ts": "n\n", "same.ts": "s\n" },
    );
    expect(d.map((f) => [f.path, f.status])).toEqual([
      ["a.ts", "modified"],
      ["gone.ts", "removed"],
      ["new.ts", "added"],
    ]);
    expect(d[0].hunks[0].lines).toEqual([" one", "-two", "+TWO"]);
  });
});

describe("versioning", () => {
  it("snapshots per turn, diffs against the previous version and restores forward", () => {
    const store = new Store();
    const p = store.createProject("demo");
    expect(store.addVersion(p.id, { "a.ts": "1" }, "first", ok)).toBe(1);
    expect(store.addVersion(p.id, { "a.ts": "2", "b.ts": "b" }, "second", { ok: false, log: "boom" })).toBe(2);

    expect(store.getProject(p.id)!.head).toBe(2);
    expect(store.headFiles(p.id)).toEqual({ "a.ts": "2", "b.ts": "b" });
    expect(store.getVersion(p.id, 2)!.buildLog).toBe("boom");
    expect(versionDiff(store, p.id, 1).map((f) => f.status)).toEqual(["added"]);
    expect(versionDiff(store, p.id, 2).map((f) => f.path)).toEqual(["a.ts", "b.ts"]);

    expect(restoreVersion(store, p.id, 1, ok)).toBe(3);
    expect(store.headFiles(p.id)).toEqual({ "a.ts": "1" });
    expect(store.listVersions(p.id).map((v) => v.summary)).toEqual(["first", "second", "Restored v1"]);
    expect(() => restoreVersion(store, p.id, 99, ok)).toThrow(/not found/);
  });

  it("keeps messages per project and cascades deletes", () => {
    const store = new Store();
    const p = store.createProject("demo");
    store.addMessage(p.id, "user", "make a site");
    store.addMessage(p.id, "assistant", "done", 1);
    expect(store.listMessages(p.id).map((m) => m.role)).toEqual(["user", "assistant"]);
    store.deleteProject(p.id);
    expect(store.listMessages(p.id)).toEqual([]);
    expect(store.getProject(p.id)).toBeUndefined();
  });
});
