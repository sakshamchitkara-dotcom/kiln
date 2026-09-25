import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../server/app.ts";

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "kiln-api-"));
afterAll(() => fs.rm(dataDir, { recursive: true, force: true }));
const { app } = createApp({ dataDir, scripted: true, model: "scripted" });

const json = (method: string, body?: unknown) => ({ method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

async function chat(id: string, prompt: string) {
  const res = await app.request(`/api/projects/${id}/chat`, json("POST", { prompt }));
  expect(res.headers.get("content-type")).toContain("text/event-stream");
  const text = await res.text();
  return text.split("\n").filter((l) => l.startsWith("event: ")).map((l) => l.slice(7));
}

describe("HTTP API (scripted mode)", { timeout: 30_000 }, () => {
  it("runs the create → edit → restore → export loop", async () => {
    const p = await (await app.request("/api/projects", json("POST", { name: "Bakery" }))).json();
    expect(p.head).toBe(1);

    const events = await chat(p.id, 'a landing page called "Crumb" for a bakery');
    expect(events).toEqual(expect.arrayContaining(["status", "plan", "tool", "build", "version", "done"]));

    const preview = await app.request(`/preview/${p.id}/2/`);
    expect(preview.status).toBe(200);
    expect(preview.headers.get("content-security-policy")).toContain("sandbox");
    expect(await preview.text()).toContain("<title>Crumb</title>");

    await chat(p.id, "make it green");
    const diff = await (await app.request(`/api/projects/${p.id}/versions/3/diff`)).json();
    expect(diff.map((d: any) => d.path)).toEqual(["src/index.css"]);

    const restored = await (await app.request(`/api/projects/${p.id}/versions/2/restore`, json("POST"))).json();
    expect(restored).toEqual({ seq: 4, buildOk: true });
    const detail = await (await app.request(`/api/projects/${p.id}`)).json();
    expect(detail.versions.map((v: any) => v.summary).at(-1)).toBe("Restored v2");
    expect(detail.messages.map((m: any) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);

    const zip = await app.request(`/api/projects/${p.id}/export.zip`);
    const entries = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    expect(Object.keys(entries)).toEqual(expect.arrayContaining(["bakery/package.json", "bakery/src/App.tsx", "bakery/vite.config.ts"]));
    expect(strFromU8(entries["bakery/src/index.css"])).not.toContain("#16a34a"); // restored to pre-green
  });

  it("rejects bad input and path escapes", async () => {
    const p = await (await app.request("/api/projects", json("POST", {}))).json();
    expect((await app.request(`/api/projects/${p.id}/chat`, json("POST", { prompt: "" }))).status).toBe(400);
    expect((await app.request("/api/projects", json("POST", { template: "nope" }))).status).toBe(400);
    expect((await app.request(`/preview/${p.id}/1/..%2F..%2Fkiln.db`)).status).toBe(404);
    expect((await app.request(`/api/projects/${p.id}/versions/99/diff`)).status).toBe(404);
  });

  it("creates projects from starter templates", async () => {
    const res = await app.request("/api/projects", json("POST", { template: "dashboard" }));
    const p = await res.json();
    expect(p.name).toBe("Ledger");
    expect((await app.request(`/preview/${p.id}/1/`)).status).toBe(200);
  });
});

describe("project naming", () => {
  it("names a project from the prompt it was started with", async () => {
    const p = await (await app.request("/api/projects", json("POST", { prompt: "a blog named Field Notes, about birds" }))).json();
    expect(p.name).toBe("Field Notes");
  });
});
