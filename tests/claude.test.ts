import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { ClaudeDriver } from "../server/agent/claude.ts";
import { runTurn } from "../server/agent/loop.ts";
import type { AgentEvent } from "../server/agent/tools.ts";
import { BASE_FILES } from "../server/scaffold.ts";

// Replays canned Messages API SSE streams through the real SDK client, so the
// request shape and stream handling are tested without network or a key.
function fakeClient(responses: string[][], seen: any[]) {
  const sse = (events: unknown[]) => events.map((e: any) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return new Anthropic({
    apiKey: "test",
    maxRetries: 0,
    fetch: (async (_url: string, init: RequestInit) => {
      seen.push(JSON.parse(String(init.body)));
      const turn = responses.shift()!;
      return new Response(sse(turn.map((s) => JSON.parse(s))), { headers: { "content-type": "text/event-stream" } });
    }) as typeof fetch,
  });
}

const start = JSON.stringify({ type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } });
const stop = (reason: string) => [
  JSON.stringify({ type: "message_delta", delta: { stop_reason: reason, stop_sequence: null }, usage: { output_tokens: 5 } }),
  JSON.stringify({ type: "message_stop" }),
];

describe("ClaudeDriver", () => {
  it("sends the tool loop to claude-opus-5-5 and applies streamed tool calls", async () => {
    const seen: any[] = [];
    const edit = { path: "src/App.tsx", search: "Describe your site to get started.", replace: "Hello from Claude" };
    const client = fakeClient([
      [
        start,
        JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "edit_file", input: {} } }),
        JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(edit) } }),
        JSON.stringify({ type: "content_block_stop", index: 0 }),
        ...stop("tool_use"),
      ],
      [
        start,
        JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
        JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Changed the greeting." } }),
        JSON.stringify({ type: "content_block_stop", index: 0 }),
        ...stop("end_turn"),
      ],
    ], seen);

    const events: AgentEvent[] = [];
    const res = await runTurn({
      driver: new ClaudeDriver("claude-opus-5-5", client), files: BASE_FILES, prompt: "change the greeting", history: [],
      emit: (e) => events.push(e), build: async () => ({ ok: true, log: "", ms: 1 }),
    });

    expect(res.files["src/App.tsx"]).toContain("Hello from Claude");
    expect(res.summary).toBe("Changed the greeting.");
    expect(events).toContainEqual({ type: "status", message: "Editing a file" });
    expect(seen[0]).toMatchObject({ model: "claude-opus-5-5", thinking: { type: "adaptive" }, output_config: { effort: "high" }, stream: true });
    expect(seen[0].tools.map((t: any) => t.name)).toEqual(["plan", "list_files", "read_file", "write_file", "edit_file", "delete_file"]);
    expect(seen[0].tool_choice).toBeUndefined(); // forced tool_choice is rejected on Opus 5.5
    // Append-only history: turn 2 starts with turn 1 unchanged, then the tool result.
    expect(seen[1].messages[0]).toEqual(seen[0].messages[0]);
    expect(seen[1].messages[1]).toMatchObject({ role: "assistant", content: [{ type: "tool_use", id: "toolu_1" }] });
    expect(seen[1].messages[2].content[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1", content: "Edited src/App.tsx" });
  });

  it("stops on a refusal instead of running tools", async () => {
    const client = fakeClient([[start, ...stop("refusal")]], []);
    await expect(runTurn({
      driver: new ClaudeDriver("claude-opus-5-5", client), files: BASE_FILES, prompt: "x", history: [],
      emit: () => {}, build: async () => ({ ok: true, log: "", ms: 1 }),
    })).rejects.toThrow(/declined/);
  });
});
