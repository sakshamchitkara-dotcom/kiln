import type { Message, Project, Version, VersionMeta } from "../server/db.ts";
import type { AgentEvent } from "../server/agent/tools.ts";
import type { FileDiff } from "../server/versions.ts";

export type { AgentEvent, FileDiff, Message, Project, Version, VersionMeta };

export interface Config {
  mode: "scripted" | "claude";
  model: string;
  templates: { id: string; label: string; description: string }[];
}

export interface ProjectDetail { project: Project; versions: VersionMeta[]; messages: Message[]; busy: boolean }

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Request failed (${res.status})`);
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  config: () => req<Config>("/api/config"),
  projects: () => req<Project[]>("/api/projects"),
  create: (body: { name?: string; template?: string }) => req<Project>("/api/projects", { method: "POST", body: JSON.stringify(body) }),
  project: (id: string) => req<ProjectDetail>(`/api/projects/${id}`),
  rename: (id: string, name: string) => req<Project>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  remove: (id: string) => req<void>(`/api/projects/${id}`, { method: "DELETE" }),
  version: (id: string, seq: number) => req<Version>(`/api/projects/${id}/versions/${seq}`),
  diff: (id: string, seq: number) => req<FileDiff[]>(`/api/projects/${id}/versions/${seq}/diff`),
  restore: (id: string, seq: number) => req<{ seq: number; buildOk: boolean }>(`/api/projects/${id}/versions/${seq}/restore`, { method: "POST" }),
};

/** POST a prompt and read the SSE response (EventSource can't POST). */
export async function streamChat(id: string, prompt: string, onEvent: (e: AgentEvent) => void) {
  const res = await fetch(`/api/projects/${id}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? `Request failed (${res.status})`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
      if (data) onEvent(JSON.parse(data));
    }
  }
}
