import type Anthropic from "@anthropic-ai/sdk";
import type { BuildResult } from "../build.ts";
import type { Message } from "../db.ts";
import { ALLOWED_PACKAGES } from "../scaffold.ts";
import { Vfs, type Files } from "../vfs.ts";
import { executeTool, type Emit } from "./tools.ts";

/** One assistant turn. Implemented by Claude and by the offline scripted generator. */
export interface Driver {
  next(messages: Anthropic.MessageParam[], onText: (delta: string) => void, onToolStart?: (name: string) => void): Promise<{
    content: Anthropic.ContentBlockParam[];
    stop_reason: string | null;
  }>;
}

export interface TurnInput {
  driver: Driver;
  files: Files;
  prompt: string;
  history: Message[];
  emit: Emit;
  build: (files: Files) => Promise<BuildResult>;
  maxFixes?: number;
  maxSteps?: number;
}

export interface TurnResult { files: Files; build: BuildResult; summary: string; changed: boolean }

const INLINE_LIMIT = 80_000;
const TOOL_STATUS: Record<string, string> = {
  plan: "Planning", write_file: "Writing a file", edit_file: "Editing a file",
  read_file: "Reading a file", delete_file: "Deleting a file", list_files: "Listing files",
};

export function contextMessage(prompt: string, files: Files, history: Message[]): string {
  const recent = history.slice(-10).map((m) => `${m.role === "user" ? "User" : "You"}: ${m.content}`).join("\n\n");
  const total = Object.values(files).reduce((n, c) => n + c.length, 0);
  const listing = total <= INLINE_LIMIT
    ? Object.entries(files).map(([p, c]) => `<file path="${p}">\n${c}\n</file>`).join("\n")
    : `Files (use read_file to open them):\n${Object.keys(files).join("\n")}`;
  return [
    recent && `<conversation_so_far>\n${recent}\n</conversation_so_far>`,
    `<current_project>\n${listing}\n</current_project>`,
    `<request>\n${prompt}\n</request>`,
  ].filter(Boolean).join("\n\n");
}

export const buildFailureMessage = (log: string) =>
  `The build failed:\n\n${log}\n\nFix the cause with the file tools. Only ${ALLOWED_PACKAGES.join(", ")} can be imported.`;

/**
 * Runs the model's tool loop against a VFS, then validates with a real build.
 * Build errors go back to the model as a new user message (append-only, so
 * thinking blocks stay valid) for a bounded number of fix attempts.
 */
export async function runTurn(t: TurnInput): Promise<TurnResult> {
  const vfs = new Vfs(t.files);
  const before = JSON.stringify(vfs.snapshot());
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: contextMessage(t.prompt, t.files, t.history) }];
  const maxFixes = t.maxFixes ?? 2;
  let summary = "";
  let build: BuildResult = { ok: false, log: "", ms: 0 };

  for (let attempt = 0; attempt <= maxFixes; attempt++) {
    summary = (await toolLoop(t, vfs, messages, t.maxSteps ?? 40)) || summary;
    const changed = JSON.stringify(vfs.snapshot()) !== before;
    if (!changed) return { files: vfs.snapshot(), build: { ok: true, log: "", ms: 0 }, summary, changed: false };

    t.emit({ type: "build", phase: "start", attempt });
    build = await t.build(vfs.snapshot());
    t.emit({ type: "build", phase: build.ok ? "ok" : "fail", attempt, log: build.log, ms: build.ms });
    if (build.ok || attempt === maxFixes) break;
    t.emit({ type: "status", message: `Build failed, asking for a fix (${attempt + 1}/${maxFixes})` });
    messages.push({ role: "user", content: buildFailureMessage(build.log) });
  }
  return { files: vfs.snapshot(), build, summary, changed: true };
}

async function toolLoop(t: TurnInput, vfs: Vfs, messages: Anthropic.MessageParam[], maxSteps: number): Promise<string> {
  let text = "";
  for (let step = 0; step < maxSteps; step++) {
    let stepText = "";
    const res = await t.driver.next(messages, (d) => {
      if (!stepText && text) t.emit({ type: "text", delta: "\n\n" }); // separate text from earlier steps
      stepText += d;
      t.emit({ type: "text", delta: d });
    }, (name) => t.emit({ type: "status", message: TOOL_STATUS[name] ?? `Running ${name}` }));
    if (stepText) text = stepText;
    messages.push({ role: "assistant", content: res.content });

    if (res.stop_reason === "refusal") throw new Error("The model declined this request.");
    if (res.stop_reason === "max_tokens") throw new Error("The response was cut off (max_tokens). Try a smaller request.");
    const calls = res.content.filter((b): b is Anthropic.ToolUseBlockParam => b.type === "tool_use");
    if (calls.length === 0) return text;

    const results: Anthropic.ToolResultBlockParam[] = calls.map((c) => {
      const r = executeTool(vfs, c.name, c.input, t.emit);
      return { type: "tool_result", tool_use_id: c.id, content: r.content, ...(r.isError ? { is_error: true } : {}) };
    });
    messages.push({ role: "user", content: results });
  }
  throw new Error(`Stopped after ${maxSteps} tool steps without finishing.`);
}
