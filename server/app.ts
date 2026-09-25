import fs from "node:fs/promises";
import { readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { strToU8, zipSync } from "fflate";
import { ClaudeDriver } from "./agent/claude.ts";
import { runTurn, type Driver } from "./agent/loop.ts";
import { ScriptedDriver, extractName } from "./agent/scripted.ts";
import type { AgentEvent } from "./agent/tools.ts";
import { buildProject, type BuildResult } from "./build.ts";
import { Store } from "./db.ts";
import { BASE_FILES, withProjectConfig } from "./scaffold.ts";
import { TEMPLATES } from "./templates/index.ts";
import { restoreVersion, versionDiff } from "./versions.ts";
import { Vfs, VfsError, type Files } from "./vfs.ts";

// Injected into every preview page: reports uncaught errors to the Kiln window
// so the user can hand them to the model. Only messages cross the sandbox.
const ERROR_BRIDGE = `<script>(function(){function send(m){try{parent.postMessage({kiln:"runtime-error",message:String(m).slice(0,2000)},"*")}catch(_){}}
addEventListener("error",function(e){send(e.message+(e.filename?" ("+e.filename.split("/").pop()+":"+e.lineno+")":""))});
addEventListener("unhandledrejection",function(e){send(e.reason&&e.reason.message||e.reason)});})();</script>`;

export interface AppConfig {
  dataDir: string;
  scripted: boolean;
  model: string;
  scriptedDelayMs?: number;
  makeDriver?: (prompt: string, files: Files) => Driver;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain",
};

/** Remove half-written build output left by a crash or restart mid-turn. */
function sweepStaging(previews: string) {
  for (const project of readdirSafe(previews)) {
    for (const entry of readdirSafe(path.join(previews, project))) {
      if (entry.startsWith("staging-")) rmSync(path.join(previews, project, entry), { recursive: true, force: true });
    }
  }
}
const readdirSafe = (dir: string) => { try { return readdirSync(dir); } catch { return []; } };

export function createApp(cfg: AppConfig) {
  const store = new Store(path.join(cfg.dataDir, "kiln.db"));
  const previews = path.join(cfg.dataDir, "previews");
  const busy = new Set<string>();
  const app = new Hono();
  sweepStaging(previews);

  const previewDir = (id: string, seq: number | string) => path.join(previews, id, String(seq));
  const driverFor = cfg.makeDriver ?? ((prompt: string, files: Files) =>
    cfg.scripted ? ScriptedDriver.fromPrompt(prompt, files, cfg.scriptedDelayMs ?? 0) : new ClaudeDriver(cfg.model));

  /** Build files straight into the preview slot for a version. */
  async function commitVersion(id: string, files: Files, summary: string, build?: BuildResult) {
    const staging = previewDir(id, `staging-${randomUUID()}`);
    const result = build ?? (await buildProject(files, staging));
    const seq = store.addVersion(id, files, summary, result);
    if (result.ok) await fs.rename(staging, previewDir(id, seq));
    return { seq, build: result };
  }

  const projectOr404 = (id: string) => store.getProject(id);

  app.onError((err, c) => {
    if (err instanceof VfsError) return c.json({ error: err.message }, 400);
    console.error(err);
    return c.json({ error: err.message }, 500);
  });

  app.get("/api/config", (c) =>
    c.json({
      mode: cfg.scripted ? "scripted" : "claude",
      model: cfg.scripted ? "scripted" : cfg.model,
      templates: Object.entries(TEMPLATES).map(([id, t]) => ({ id, label: t.label, description: t.description })),
    }),
  );

  app.get("/api/projects", (c) => c.json(store.listProjects()));

  app.post("/api/projects", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const t = body.template ? TEMPLATES[body.template] : undefined;
    if (body.template && !t) return c.json({ error: "unknown template" }, 400);
    const fromPrompt = typeof body.prompt === "string" ? extractName(body.prompt) : undefined;
    const name = String(body.name ?? fromPrompt ?? t?.defaultName ?? "Untitled site").slice(0, 80);
    const project = store.createProject(name);
    const files = t ? t.build({ name, accent: t.accent }) : BASE_FILES;
    await commitVersion(project.id, files, t ? `Started from the ${t.label.toLowerCase()} template` : "Blank project");
    return c.json(store.getProject(project.id), 201);
  });

  app.get("/api/projects/:id", (c) => {
    const id = c.req.param("id");
    const project = projectOr404(id);
    if (!project) return c.json({ error: "project not found" }, 404);
    return c.json({ project, versions: store.listVersions(id), messages: store.listMessages(id), busy: busy.has(id) });
  });

  app.patch("/api/projects/:id", async (c) => {
    const id = c.req.param("id");
    if (!projectOr404(id)) return c.json({ error: "project not found" }, 404);
    const { name } = await c.req.json();
    if (typeof name !== "string" || !name.trim()) return c.json({ error: "name is required" }, 400);
    store.renameProject(id, name.trim().slice(0, 80));
    return c.json(store.getProject(id));
  });

  app.delete("/api/projects/:id", async (c) => {
    const id = c.req.param("id");
    store.deleteProject(id);
    await fs.rm(path.join(previews, id), { recursive: true, force: true });
    return c.body(null, 204);
  });

  app.get("/api/projects/:id/versions/:seq", (c) => {
    const v = store.getVersion(c.req.param("id"), Number(c.req.param("seq")));
    return v ? c.json(v) : c.json({ error: "version not found" }, 404);
  });

  app.get("/api/projects/:id/versions/:seq/diff", (c) => {
    const id = c.req.param("id");
    const seq = Number(c.req.param("seq"));
    if (!store.getVersion(id, seq)) return c.json({ error: "version not found" }, 404);
    return c.json(versionDiff(store, id, seq));
  });

  app.post("/api/projects/:id/versions/:seq/restore", async (c) => {
    const id = c.req.param("id");
    const seq = Number(c.req.param("seq"));
    const v = store.getVersion(id, seq);
    if (!v) return c.json({ error: "version not found" }, 404);
    if (busy.has(id)) return c.json({ error: "a generation is running for this project" }, 409);
    const staging = previewDir(id, `staging-${randomUUID()}`);
    const build = await buildProject(v.files, staging);
    const next = restoreVersion(store, id, seq, build);
    if (build.ok) await fs.rename(staging, previewDir(id, next));
    return c.json({ seq: next, buildOk: build.ok });
  });

  app.get("/api/projects/:id/export.zip", (c) => {
    const id = c.req.param("id");
    const project = projectOr404(id);
    if (!project) return c.json({ error: "project not found" }, 404);
    const seq = Number(c.req.query("seq") ?? project.head);
    const v = store.getVersion(id, seq);
    if (!v) return c.json({ error: "version not found" }, 404);
    const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site";
    const files = withProjectConfig(v.files, project.name);
    files["README.md"] ??= `# ${project.name}\n\nGenerated with Kiln (version ${seq}).\n\n\`\`\`sh\nnpm install\nnpm run dev\n\`\`\`\n`;
    const zip = zipSync(Object.fromEntries(Object.entries(files).map(([p, s]) => [`${slug}/${p}`, strToU8(s)])));
    return new Response(zip, {
      headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${slug}-v${seq}.zip"` },
    });
  });

  app.post("/api/projects/:id/chat", async (c) => {
    const id = c.req.param("id");
    const project = projectOr404(id);
    if (!project) return c.json({ error: "project not found" }, 404);
    const { prompt } = await c.req.json().catch(() => ({}));
    if (typeof prompt !== "string" || !prompt.trim()) return c.json({ error: "prompt is required" }, 400);
    if (prompt.length > 8_000) return c.json({ error: "prompt is too long (8,000 characters max)" }, 400);
    if (busy.has(id)) return c.json({ error: "a generation is already running for this project" }, 409);
    busy.add(id);

    const history = store.listMessages(id);
    store.addMessage(id, "user", prompt);
    const files = store.headFiles(id);

    return streamSSE(c, async (stream) => {
      const emit = (e: AgentEvent) => { stream.writeSSE({ event: e.type, data: JSON.stringify(e) }).catch(() => {}); };
      const staging = previewDir(id, `staging-${randomUUID()}`);
      try {
        emit({ type: "status", message: cfg.scripted ? "Scripted generator (offline)" : `Thinking with ${cfg.model}` });
        const result = await runTurn({
          driver: driverFor(prompt, files), files, prompt, history, emit,
          build: (f) => buildProject(f, staging),
        });
        let seq: number | null = null;
        if (result.changed) {
          const title = prompt.length > 70 ? prompt.slice(0, 67) + "…" : prompt;
          seq = store.addVersion(id, result.files, title, result.build);
          if (result.build.ok) await fs.rename(staging, previewDir(id, seq));
          emit({ type: "version", seq, summary: title, buildOk: result.build.ok });
        }
        const reply = result.summary || (result.changed ? "Done." : "No changes.");
        const note = !result.changed ? "" : !result.build.ok ? "\n\nThe build still fails; see the build log."
          : result.build.typeErrors ? "\n\nTypeScript still reports errors; the site runs, but see the build log." : "";
        store.addMessage(id, "assistant", reply + note, seq);
        emit({ type: "done", message: reply });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        store.addMessage(id, "assistant", `Generation failed: ${message}`);
        emit({ type: "error", message });
      } finally {
        busy.delete(id);
        await fs.rm(staging, { recursive: true, force: true });
      }
    });
  });

  // Generated sites are served with a CSP sandbox so they get an opaque origin
  // even if opened outside the iframe: no access to Kiln's API or storage.
  app.get("/preview/:id/:seq/*", async (c) => {
    const { id, seq } = c.req.param();
    if (!/^[0-9a-f-]{36}$/.test(id) || !/^\d+$/.test(seq)) return c.notFound();
    const root = previewDir(id, seq);
    const rest = decodeURIComponent(c.req.path.split("/").slice(4).join("/")) || "index.html";
    const file = path.resolve(root, rest);
    if (!file.startsWith(root + path.sep)) return c.notFound();
    const data = await fs.readFile(file).catch(() => null);
    if (!data) return c.text("This version has no preview. Its build failed.", 404);
    const body = file.endsWith(".html") ? data.toString("utf8").replace("<head>", `<head>${ERROR_BRIDGE}`) : data;
    return c.body(body, 200, {
      "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream",
      "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-popups allow-modals",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache",
    });
  });

  return { app, store };
}
