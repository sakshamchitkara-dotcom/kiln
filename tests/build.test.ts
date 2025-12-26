import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildProject } from "../server/build.ts";
import { BASE_FILES } from "../server/scaffold.ts";

const out = await fs.mkdtemp(path.join(os.tmpdir(), "kiln-test-out-"));
afterAll(() => fs.rm(out, { recursive: true, force: true }));
const withApp = (app: string, extra = {}) => ({ ...BASE_FILES, "src/App.tsx": app, ...extra });

describe("buildProject", { timeout: 30_000 }, () => {
  it("builds the base project into static assets", async () => {
    const r = await buildProject(BASE_FILES, path.join(out, "ok"));
    expect(r.ok, r.log).toBe(true);
    const html = await fs.readFile(path.join(out, "ok", "index.html"), "utf8");
    expect(html).toMatch(/\.\/assets\/index-.*\.js/); // relative base, servable from any path
  });

  it("compiles tailwind utilities and lucide icons", async () => {
    const r = await buildProject(
      withApp(`import { Flame } from "lucide-react";\nexport default () => <Flame className="text-emerald-700" />;`),
      path.join(out, "tw"),
    );
    expect(r.ok, r.log).toBe(true);
    const assets = await fs.readdir(path.join(out, "tw", "assets"));
    const css = await fs.readFile(path.join(out, "tw", "assets", assets.find((a) => a.endsWith(".css"))!), "utf8");
    expect(css).toContain("text-emerald-700");
  });

  it("reports syntax errors with file and line", async () => {
    const r = await buildProject(withApp("export default () => <p>{</p>"), path.join(out, "bad"));
    expect(r.ok).toBe(false);
    expect(r.log).toContain("src/App.tsx:1");
    expect(r.log).not.toContain(os.tmpdir()); // temp paths are scrubbed
  });

  it("rejects packages outside the allow list", async () => {
    const r = await buildProject(withApp(`import _ from "lodash"; export default () => _.noop();`), path.join(out, "dep"));
    expect(r.ok).toBe(false);
    expect(r.log).toContain('Package "lodash" is not available');
  });

  it("blocks reading host files through ?raw imports", async () => {
    const r = await buildProject(withApp(`import x from "/etc/hosts?raw"; export default () => x;`), path.join(out, "raw"));
    expect(r.ok).toBe(false);
    expect(r.log).toContain("points outside the project");
  });

  it("blocks reading host files through CSS imports (permission model)", async () => {
    // Tailwind resolves CSS @imports itself, outside Vite's resolver, so only the
    // process sandbox stands between this import and the host file.
    const secret = path.join(out, "secret.css");
    await fs.writeFile(secret, ".leak { color: red }");
    const r = await buildProject({ ...BASE_FILES, "src/index.css": `@import "tailwindcss";\n@import "${secret}";\n` }, path.join(out, "css"));
    expect(r.ok).toBe(false);
    expect(r.log).toContain("Access to this API has been restricted");
  });

  it("kills builds that exceed the timeout", async () => {
    const r = await buildProject(BASE_FILES, path.join(out, "slow"), 50);
    expect(r.ok).toBe(false);
    expect(r.log).toMatch(/timed out/);
  });
});
