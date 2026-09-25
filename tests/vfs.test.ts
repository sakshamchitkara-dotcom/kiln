import { describe, expect, it } from "vitest";
import { LIMITS, Vfs, VfsError, normalizePath } from "../server/vfs.ts";

describe("normalizePath", () => {
  it("accepts ordinary source paths", () => {
    expect(normalizePath("src/App.tsx")).toBe("src/App.tsx");
    expect(normalizePath("./src/components/Hero.tsx")).toBe("src/components/Hero.tsx");
    expect(normalizePath("src\\index.css")).toBe("src/index.css");
  });

  it.each([
    "../etc/passwd",
    "src/../../secret.ts",
    "/etc/passwd.txt",
    "C:/Windows/x.ts",
    "src//App.tsx",
    ".env",
    "src/.hidden.ts",
    "node_modules/react/index.js",
    "package.json",
    "vite.config.ts",
    "dist/index.html",
    "src/run.sh",
    "a\0.ts",
    "",
  ])("rejects %j", (p) => {
    expect(() => normalizePath(p)).toThrow(VfsError);
  });

  it("rejects non-strings", () => {
    expect(() => normalizePath(42)).toThrow(VfsError);
  });
});

describe("Vfs", () => {
  it("writes, reads, lists and deletes", () => {
    const fs = new Vfs();
    fs.write("src/b.ts", "b");
    fs.write("src/a.ts", "a");
    expect(fs.list()).toEqual(["src/a.ts", "src/b.ts"]);
    expect(fs.read("src/a.ts")).toBe("a");
    fs.delete("src/a.ts");
    expect(fs.list()).toEqual(["src/b.ts"]);
    expect(() => fs.read("src/a.ts")).toThrow(/not found/);
    expect(() => fs.delete("src/a.ts")).toThrow(/not found/);
  });

  it("edits only when the search text matches exactly once", () => {
    const fs = new Vfs({ "src/App.tsx": "<h1>Hi</h1>\n<p>x</p>\n<p>x</p>" });
    fs.edit("src/App.tsx", "<h1>Hi</h1>", "<h1>Hello $&</h1>");
    expect(fs.read("src/App.tsx")).toContain("<h1>Hello $&</h1>"); // no regex replacement patterns
    expect(() => fs.edit("src/App.tsx", "<p>x</p>", "y")).toThrow(/matches 2 times/);
    expect(() => fs.edit("src/App.tsx", "nope", "y")).toThrow(/not found/);
  });

  it("enforces size and count limits", () => {
    const fs = new Vfs();
    expect(() => fs.write("big.txt", "x".repeat(LIMITS.maxFileBytes + 1))).toThrow(/exceeds/);
    for (let i = 0; i < LIMITS.maxFiles; i++) fs.write(`f${i}.txt`, "");
    expect(() => fs.write("one-more.txt", "")).toThrow(/files/);
    fs.write("f0.txt", "overwrite is fine at the cap");
  });

  it("snapshots are sorted plain objects and do not alias", () => {
    const fs = new Vfs({ "z.ts": "z", "a.ts": "a" });
    const snap = fs.snapshot();
    expect(Object.keys(snap)).toEqual(["a.ts", "z.ts"]);
    fs.write("a.ts", "changed");
    expect(snap["a.ts"]).toBe("a");
  });
});
