import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { buildProject } from "../server/build.ts";
import { runTurn, type Driver } from "../server/agent/loop.ts";
import { ScriptedDriver, extractName, pickTemplate } from "../server/agent/scripted.ts";
import type { AgentEvent } from "../server/agent/tools.ts";
import { BASE_FILES } from "../server/scaffold.ts";
import type { Files } from "../server/vfs.ts";

const realBuild = async (files: Files) => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "kiln-agent-"));
  try { return await buildProject(files, out); } finally { await fs.rm(out, { recursive: true, force: true }); }
};

async function turn(prompt: string, files: Files = BASE_FILES, build = realBuild) {
  const events: AgentEvent[] = [];
  const result = await runTurn({ driver: ScriptedDriver.fromPrompt(prompt, files), files, prompt, history: [], emit: (e) => events.push(e), build });
  return { result, events };
}

describe("scripted intent parsing", () => {
  it("picks a template and a name from the prompt", () => {
    expect(pickTemplate("an analytics dashboard for a coffee chain")).toBe("dashboard");
    expect(pickTemplate("a personal blog about gardening")).toBe("blog");
    expect(pickTemplate("a site for my bakery")).toBe("landing");
    expect(extractName('a landing page called "Crumb & Co" for a bakery')).toBe("Crumb & Co");
    expect(extractName("a blog named Field Notes, about birds")).toBe("Field Notes");
  });
});

describe("runTurn with the scripted driver", { timeout: 30_000 }, () => {
  it("creates a site, builds it and reports plan, tools and build events", async () => {
    const { result, events } = await turn('A landing page called "Crumb" for a bakery, green accent');
    expect(result.changed).toBe(true);
    expect(result.build.ok).toBe(true);
    expect(result.files["src/content.ts"]).toContain('"name": "Crumb"');
    expect(result.files["src/index.css"]).toContain("--color-accent: #16a34a;");
    expect(events.some((e) => e.type === "plan")).toBe(true);
    expect(events.filter((e) => e.type === "tool" && e.name === "write_file").length).toBeGreaterThan(5);
    expect(events.find((e) => e.type === "build" && e.phase === "ok")).toBeTruthy();
    expect(result.summary).toMatch(/landing page for Crumb/);
  });

  it("applies follow-up edits with edit_file", async () => {
    const first = await turn("a landing page for a bakery");
    const { result, events } = await turn('make it purple, set the headline to "Bread worth waking up for" and add testimonials', first.result.files);
    expect(result.build.ok).toBe(true);
    expect(result.files["src/index.css"]).toContain("#9333ea");
    expect(result.files["src/content.ts"]).toContain("Bread worth waking up for");
    expect(result.files["src/App.tsx"]).toContain("<Testimonials />");
    expect(events.filter((e) => e.type === "tool" && e.name === "edit_file").every((e) => e.type === "tool" && e.ok)).toBe(true);
  });

  it("feeds build errors back and auto-fixes", async () => {
    const { result, events } = await turn("a blog, simulate a build error");
    const builds = events.filter((e) => e.type === "build");
    expect(builds.map((e) => e.type === "build" && e.phase)).toEqual(["start", "fail", "start", "ok"]);
    expect(result.build.ok).toBe(true);
  });

  it("feeds type errors back even though the bundle built", async () => {
    const { result, events } = await turn("a landing page, simulate a type error");
    const builds = events.filter((e) => e.type === "build" && e.phase !== "start");
    expect(builds.map((e) => e.type === "build" && !!e.typeErrors)).toEqual([true, false]);
    expect(result.build.typeErrors).toBeUndefined();
    expect(result.files["src/lib/format.ts"]).toContain("toLocaleString");
  });

  it("simulates a render-time crash and fixes it from the runtime error report", async () => {
    const first = await turn("a landing page, simulate a runtime error");
    expect(first.result.build.ok).toBe(true);
    expect(first.result.build.typeErrors).toBeUndefined(); // only the browser can catch this one
    expect(first.result.files["src/App.tsx"]).toContain(".kilnVisits.length");
    const { result } = await turn("The preview throws a runtime error: Cannot read properties of undefined (reading 'length'). Find the cause and fix it.", first.result.files);
    expect(result.changed).toBe(true);
    expect(result.files["src/App.tsx"]).not.toContain("kilnVisits");
  });

  it("reports no change when the request is not understood", async () => {
    const first = await turn("a landing page");
    const { result } = await turn("translate everything to Klingon", first.result.files);
    expect(result.changed).toBe(false);
    expect(result.summary).toMatch(/Scripted mode/);
  });

  it("gives up after the bounded number of fix attempts", async () => {
    // A driver that keeps writing broken code: the loop must stop, not spin.
    let n = 0;
    const driver: Driver = {
      async next(messages) {
        const last = messages[messages.length - 1];
        if (Array.isArray(last.content)) return { content: [{ type: "text", text: "done" }], stop_reason: "end_turn" };
        const call: Anthropic.ToolUseBlockParam = { type: "tool_use", id: `t${++n}`, name: "write_file", input: { path: "src/App.tsx", content: `broken ${n} <` } };
        return { content: [call], stop_reason: "tool_use" };
      },
    };
    let builds = 0;
    const res = await runTurn({
      driver, files: BASE_FILES, prompt: "x", history: [], emit: () => {}, maxFixes: 2,
      build: async () => { builds++; return { ok: false, log: "syntax error", ms: 1 }; },
    });
    expect(builds).toBe(3);
    expect(res.build.ok).toBe(false);
  });

  it("returns tool errors to the model instead of throwing", async () => {
    const seen: string[] = [];
    const driver: Driver = {
      async next(messages) {
        const last = messages[messages.length - 1];
        if (Array.isArray(last.content)) {
          for (const b of last.content) if (b.type === "tool_result") seen.push(String(b.content));
          return { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" };
        }
        return { content: [{ type: "tool_use", id: "t1", name: "write_file", input: { path: "../../etc/passwd.txt", content: "x" } }], stop_reason: "tool_use" };
      },
    };
    const res = await runTurn({ driver, files: BASE_FILES, prompt: "x", history: [], emit: () => {}, build: realBuild });
    expect(seen[0]).toMatch(/invalid path segment/);
    expect(res.changed).toBe(false);
  });
});
