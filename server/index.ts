import fs from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app.ts";

const dataDir = path.resolve(process.env.KILN_DATA_DIR ?? "data");
fs.mkdirSync(dataDir, { recursive: true });
const scripted = process.env.KILN_SCRIPTED === "true" || !process.env.ANTHROPIC_API_KEY;
const model = process.env.KILN_MODEL ?? "claude-opus-5-5";
const port = Number(process.env.PORT ?? 8787);
// Kiln has no login and runs model-written code, so it only listens on this
// machine unless KILN_HOST says otherwise.
const hostname = process.env.KILN_HOST ?? "127.0.0.1";

const { app } = createApp({ dataDir, scripted, model, scriptedDelayMs: 12 });

if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" })); // SPA fallback
}

serve({ fetch: app.fetch, port, hostname }, () => {
  console.log(`kiln listening on http://${hostname}:${port} (${scripted ? "scripted mode, no API key" : `model ${model}`})`);
});
