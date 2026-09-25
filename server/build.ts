import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALLOWED_PACKAGES } from "./scaffold.ts";
import type { Files } from "./vfs.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const NODE_MODULES = path.join(REPO, "node_modules");
const WORKER = path.join(HERE, "build-worker.mjs");
const TMP = realpathSync(os.tmpdir());
const MAX_LOG = 8_000;

export interface BuildResult { ok: boolean; log: string; ms: number }

/**
 * Builds a file set with `vite build` in a throwaway directory and copies the
 * output to `outDir`. The build runs in a separate node process with a hard
 * timeout and a scrubbed environment (no API keys). Generated code is only
 * bundled here, never executed; it runs in the browser's sandboxed iframe.
 */
export async function buildProject(files: Files, outDir: string, timeoutMs = 60_000): Promise<BuildResult> {
  const started = Date.now();
  const work = await fs.mkdtemp(path.join(TMP, "kiln-build-"));
  try {
    const src = path.join(work, "src-root");
    const dist = path.join(work, "dist");
    for (const [p, content] of Object.entries(files)) {
      const target = path.join(src, p);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content);
    }
    await fs.symlink(NODE_MODULES, path.join(src, "node_modules"), "dir");
    // Under the permission model fs.existsSync throws outside the allowed dirs,
    // so give Vite's package/workspace-root searches something to stop at.
    await fs.writeFile(path.join(src, "package.json"), '{"private":true,"type":"module"}\n');
    await fs.writeFile(path.join(src, "pnpm-workspace.yaml"), "");

    const { code, output, timedOut } = await run(
      process.execPath,
      [
        // Node permission model: the build may read only its own temp dir, the
        // shared node_modules and the worker script, and write only its temp dir.
        "--permission",
        "--no-warnings",
        `--allow-fs-read=${work}`,
        `--allow-fs-read=${realpathSync(NODE_MODULES)}`,
        `--allow-fs-read=${WORKER}`,
        `--allow-fs-write=${work}`,
        "--allow-addons", // rolldown, lightningcss and tailwind oxide are native addons
        "--allow-worker",
        WORKER, src, dist, ALLOWED_PACKAGES.join(","),
      ],
      work,
      timeoutMs,
    );
    const log = clean(output, src);
    if (timedOut) return { ok: false, log: `Build timed out after ${timeoutMs / 1000}s\n${log}`, ms: Date.now() - started };
    if (code !== 0) return { ok: false, log: log || `Build failed with exit code ${code}`, ms: Date.now() - started };

    await fs.rm(outDir, { recursive: true, force: true });
    await fs.mkdir(path.dirname(outDir), { recursive: true });
    await fs.cp(dist, outDir, { recursive: true });
    return { ok: true, log, ms: Date.now() - started };
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

function run(cmd: string, args: string[], cwd: string, timeoutMs: number) {
  return new Promise<{ code: number | null; output: string; timedOut: boolean }>((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { PATH: process.env.PATH ?? "", NODE_ENV: "production", HOME: cwd, TMPDIR: cwd },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let timedOut = false;
    const onData = (d: Buffer) => { if (output.length < MAX_LOG * 4) output += d.toString(); };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, output, timedOut }); });
  });
}

// Strip ANSI codes and temp paths so the log reads well to users and the model.
function clean(log: string, root: string) {
  const out = log
    .replace(/\x1b\[[0-9;]*m/g, "")
    .split("\n")
    .filter((l) => !/^\s+at /.test(l))
    .join("\n")
    .split(root + path.sep).join("")
    .split(path.basename(root) + path.sep).join("")
    .trim();
  return out.length > MAX_LOG ? out.slice(0, MAX_LOG) + "\n…(truncated)" : out;
}
