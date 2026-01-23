import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { Vfs, VfsError } from "../vfs.ts";

export type AgentEvent =
  | { type: "status"; message: string }
  | { type: "plan"; steps: string[] }
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; path?: string; ok: boolean; error?: string }
  | { type: "build"; phase: "start" | "ok" | "fail"; attempt: number; log?: string; ms?: number }
  | { type: "version"; seq: number; summary: string; buildOk: boolean }
  | { type: "done"; message: string }
  | { type: "error"; message: string };

export type Emit = (e: AgentEvent) => void;

const str = (description: string) => ({ type: "string" as const, description });

// eager_input_streaming lets big file contents stream instead of arriving in one
// burst; the server then skips validation, so every input goes through zod below.
export const TOOLS: Anthropic.Tool[] = [
  {
    name: "plan",
    description: "Record a short plan (3-7 steps) before changing files. Call once at the start of a turn.",
    input_schema: { type: "object", properties: { steps: { type: "array", items: { type: "string" } } }, required: ["steps"] },
  },
  {
    name: "list_files",
    description: "List every file in the project with its size in bytes.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "read_file",
    description: "Read a project file.",
    input_schema: { type: "object", properties: { path: str("Project-relative path, e.g. src/App.tsx") }, required: ["path"] },
  },
  {
    name: "write_file",
    description: "Create or fully overwrite a file. Prefer edit_file for small changes to existing files.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { path: str("Project-relative path"), content: str("Complete file content") },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description:
      "Replace one exact occurrence of `search` with `replace` in a file. `search` must match the current file byte-for-byte and appear exactly once; include enough surrounding lines to make it unique.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { path: str("Project-relative path"), search: str("Exact text to find"), replace: str("Replacement text") },
      required: ["path", "search", "replace"],
    },
  },
  {
    name: "delete_file",
    description: "Delete a file.",
    input_schema: { type: "object", properties: { path: str("Project-relative path") }, required: ["path"] },
  },
];

const schemas = {
  plan: z.object({ steps: z.array(z.string()).min(1).max(12) }),
  list_files: z.object({}).passthrough(),
  read_file: z.object({ path: z.string() }),
  write_file: z.object({ path: z.string(), content: z.string() }),
  edit_file: z.object({ path: z.string(), search: z.string(), replace: z.string() }),
  delete_file: z.object({ path: z.string() }),
};

export interface ToolOutcome { content: string; isError: boolean }

export function executeTool(vfs: Vfs, name: string, rawInput: unknown, emit: Emit): ToolOutcome {
  const schema = schemas[name as keyof typeof schemas];
  if (!schema) return { content: `Unknown tool ${name}`, isError: true };
  const parsed = schema.safeParse(rawInput);
  if (!parsed.success) {
    emit({ type: "tool", name, ok: false, error: "invalid input" });
    return { content: `Invalid input for ${name}: ${parsed.error.message}. Re-send the call with complete arguments.`, isError: true };
  }
  const input = parsed.data as any;
  try {
    switch (name) {
      case "plan":
        emit({ type: "plan", steps: input.steps });
        return { content: "Plan recorded. Go ahead.", isError: false };
      case "list_files":
        return { content: vfs.list().map((p) => `${p} (${Buffer.byteLength(vfs.read(p))} bytes)`).join("\n") || "(empty project)", isError: false };
      case "read_file": {
        const content = vfs.read(input.path);
        emit({ type: "tool", name, path: input.path, ok: true });
        return { content, isError: false };
      }
      case "write_file": {
        const path = vfs.write(input.path, input.content);
        emit({ type: "tool", name, path, ok: true });
        return { content: `Wrote ${path}`, isError: false };
      }
      case "edit_file": {
        const path = vfs.edit(input.path, input.search, input.replace);
        emit({ type: "tool", name, path, ok: true });
        return { content: `Edited ${path}`, isError: false };
      }
      case "delete_file": {
        const path = vfs.delete(input.path);
        emit({ type: "tool", name, path, ok: true });
        return { content: `Deleted ${path}`, isError: false };
      }
    }
  } catch (err) {
    if (!(err instanceof VfsError)) throw err;
    emit({ type: "tool", name, path: typeof input.path === "string" ? input.path : undefined, ok: false, error: err.message });
    return { content: err.message, isError: true };
  }
  return { content: `Unknown tool ${name}`, isError: true };
}
