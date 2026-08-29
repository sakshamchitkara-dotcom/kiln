import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildProject } from "../server/build.ts";
import { TEMPLATES } from "../server/templates/index.ts";
import { Vfs } from "../server/vfs.ts";

describe("starter templates", { timeout: 30_000 }, () => {
  for (const [id, t] of Object.entries(TEMPLATES)) {
    it(`${id} passes the VFS rules, builds and type-checks`, async () => {
      const files = t.build({ name: t.defaultName, accent: t.accent });
      const fsCheck = new Vfs();
      for (const [p, c] of Object.entries(files)) fsCheck.write(p, c);
      const out = await fs.mkdtemp(path.join(os.tmpdir(), "kiln-tpl-"));
      const r = await buildProject(files, out);
      expect(r.ok, r.log).toBe(true);
      expect(r.typeErrors).toBeUndefined();
      await fs.rm(out, { recursive: true, force: true });
    });
  }
});
