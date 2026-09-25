// Virtual project filesystem. Everything the model touches goes through here,
// so this is the trust boundary for model-supplied paths and content.

export type Files = Record<string, string>;

export const LIMITS = {
  maxFileBytes: 200_000,
  maxTotalBytes: 2_000_000,
  maxFiles: 150,
};

// Kiln owns the build config and dependencies; the model only writes source.
const RESERVED = new Set([
  "package.json",
  "package-lock.json",
  "vite.config.ts",
  "vite.config.js",
  "vite.config.mjs",
  "tsconfig.json",
  "postcss.config.js",
  "tailwind.config.js",
]);
const RESERVED_DIRS = ["node_modules", "dist"];
const ALLOWED_EXT = /\.(tsx|ts|jsx|js|css|html|json|svg|md|txt)$/;

export class VfsError extends Error {}

export function normalizePath(input: unknown): string {
  if (typeof input !== "string" || !input.trim()) throw new VfsError("path must be a non-empty string");
  if (input.includes("\0")) throw new VfsError("path contains a NUL byte");
  let p = input.trim().replace(/\\/g, "/");
  while (p.startsWith("./")) p = p.slice(2);
  if (p.startsWith("/") || /^[a-zA-Z]:/.test(p)) throw new VfsError(`absolute paths are not allowed: ${input}`);
  const parts = p.split("/");
  for (const part of parts) {
    if (part === "" || part === "." || part === "..") throw new VfsError(`invalid path segment in ${input}`);
    if (part.startsWith(".")) throw new VfsError(`hidden files are not allowed: ${input}`);
  }
  if (p.length > 200 || parts.length > 8) throw new VfsError(`path too long: ${input}`);
  if (RESERVED.has(p) || RESERVED_DIRS.includes(parts[0])) throw new VfsError(`${p} is managed by Kiln and cannot be changed`);
  if (!ALLOWED_EXT.test(p)) throw new VfsError(`unsupported file type: ${p}`);
  return p;
}

const bytes = (s: string) => Buffer.byteLength(s, "utf8");

export class Vfs {
  private files: Map<string, string>;

  constructor(initial: Files = {}) {
    this.files = new Map(Object.entries(initial));
  }

  list(): string[] {
    return [...this.files.keys()].sort();
  }

  read(path: unknown): string {
    const p = normalizePath(path);
    const content = this.files.get(p);
    if (content === undefined) throw new VfsError(`file not found: ${p}`);
    return content;
  }

  write(path: unknown, content: unknown): string {
    const p = normalizePath(path);
    if (typeof content !== "string") throw new VfsError("content must be a string");
    if (bytes(content) > LIMITS.maxFileBytes) throw new VfsError(`${p} exceeds ${LIMITS.maxFileBytes} bytes`);
    if (!this.files.has(p) && this.files.size >= LIMITS.maxFiles) throw new VfsError(`project exceeds ${LIMITS.maxFiles} files`);
    const total = this.totalBytes() - bytes(this.files.get(p) ?? "") + bytes(content);
    if (total > LIMITS.maxTotalBytes) throw new VfsError(`project exceeds ${LIMITS.maxTotalBytes} bytes`);
    this.files.set(p, content);
    return p;
  }

  /** Search/replace edit. The search text must match exactly once. */
  edit(path: unknown, search: unknown, replace: unknown): string {
    const p = normalizePath(path);
    if (typeof search !== "string" || !search) throw new VfsError("search must be a non-empty string");
    if (typeof replace !== "string") throw new VfsError("replace must be a string");
    const current = this.read(p);
    const count = current.split(search).length - 1;
    if (count === 0) throw new VfsError(`search text not found in ${p}; read the file and copy the text exactly`);
    if (count > 1) throw new VfsError(`search text matches ${count} times in ${p}; include more surrounding context`);
    return this.write(p, current.replace(search, () => replace));
  }

  delete(path: unknown): string {
    const p = normalizePath(path);
    if (!this.files.delete(p)) throw new VfsError(`file not found: ${p}`);
    return p;
  }

  totalBytes(): number {
    let n = 0;
    for (const c of this.files.values()) n += bytes(c);
    return n;
  }

  snapshot(): Files {
    return Object.fromEntries([...this.files.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }
}
