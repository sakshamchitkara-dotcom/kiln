// Runs inside a locked-down child process (see build.ts). Plain JS on purpose:
// it must start with bare `node`, no TS loader, so the permission flags cover it.
import path from "node:path";
import { realpathSync } from "node:fs";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const [root, outDir, allowedCsv] = process.argv.slice(2);
const allowed = new Set(allowedCsv.split(","));

// Generated code may only import its own files or the allowed packages.
// Blocks `?raw` reads of host files and dependency sprawl the build can't satisfy.
const realNodeModules = realpathSync(path.join(root, "node_modules"));
const inside = (dir, file) => {
  const rel = path.relative(dir, file);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
};

const guard = {
  name: "kiln-import-guard",
  enforce: "pre",
  async resolveId(source, importer, options) {
    if (!importer || source.startsWith("\0") || source.startsWith("virtual:")) return null;
    const fromDeps = importer.includes(`${path.sep}node_modules${path.sep}`);
    const bare = source.split("?")[0];
    if (!fromDeps && !bare.startsWith(".") && !bare.startsWith("/")) {
      const pkg = bare.startsWith("@") ? bare.split("/").slice(0, 2).join("/") : bare.split("/")[0];
      if (pkg !== "tailwindcss" && pkg !== "vite" && !allowed.has(pkg)) {
        this.error(`Package "${pkg}" is not available. Only ${[...allowed].join(", ")} can be imported (and tailwindcss in CSS).`);
      }
    }
    // Check where the import actually lands: Vite falls back to absolute host
    // paths for "/..." imports, which would let `?raw` inline any host file.
    const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
    if (!resolved || resolved.external || resolved.id.startsWith("\0")) return resolved;
    const file = resolved.id.split("?")[0];
    if (!path.isAbsolute(file) || inside(root, file) || inside(realNodeModules, file)) return resolved;
    this.error(`Import "${source}" in ${path.relative(root, importer)} points outside the project`);
  },
};

try {
  await build({
    root,
    configFile: false,
    envDir: false,
    base: "./",
    logLevel: "warn",
    clearScreen: false,
    plugins: [guard, react(), tailwindcss()],
    build: { outDir, emptyOutDir: true, reportCompressedSize: false, chunkSizeWarningLimit: 4000 },
  });
  process.exit(0);
} catch (err) {
  const msg = err?.message ?? String(err);
  const loc = err?.loc ? `\n  at ${path.relative(root, err.loc.file ?? err.id ?? "")}:${err.loc.line}:${err.loc.column}` : "";
  const frame = err?.frame ? `\n${err.frame}` : "";
  process.stderr.write(`${msg}${loc}${frame}\n`);
  process.exit(1);
}
