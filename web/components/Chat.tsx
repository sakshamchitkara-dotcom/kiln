import { useEffect, useRef } from "react";
import type { AgentEvent, Message } from "../api";
import Composer from "./Composer";

type ToolEvent = Extract<AgentEvent, { type: "tool" }>;
type BuildEvent = Extract<AgentEvent, { type: "build" }>;

export interface Activity {
  prompt: string;
  status: string;
  plan: string[];
  tools: ToolEvent[];
  text: string;
  builds: BuildEvent[];
  error: string | null;
}

const verb: Record<string, string> = { write_file: "Wrote", edit_file: "Edited", delete_file: "Deleted", read_file: "Read" };

function ActivityLog({ a, live }: { a: Activity; live: boolean }) {
  return (
    <div className="activity">
      {live && a.status && <p className="activity-status">{a.status}</p>}
      {a.plan.length > 0 && (
        <ol className="plan">
          {a.plan.map((s) => <li key={s}>{s}</li>)}
        </ol>
      )}
      {a.tools.length > 0 && (
        <ul className="tool-log">
          {a.tools.map((t, i) => (
            <li key={i} className={t.ok ? "" : "tool-failed"}>
              {verb[t.name] ?? t.name} <code>{t.path}</code>
              {t.error && <span className="tool-error">{t.error}</span>}
            </li>
          ))}
        </ul>
      )}
      {a.builds.map((b, i) => (
        <div key={i} className={`build build-${b.phase === "ok" && b.typeErrors ? "warn" : b.phase}`}>
          {b.phase === "start" && <span>Building{b.attempt > 0 ? ` (fix ${b.attempt})` : ""}</span>}
          {b.phase === "ok" && !b.typeErrors && <span>Build passed in {((b.ms ?? 0) / 1000).toFixed(1)}s</span>}
          {b.phase === "ok" && b.typeErrors && (
            <details>
              <summary>Built, with type errors{b.attempt > 0 ? ` (fix ${b.attempt})` : ""}</summary>
              <pre>{b.typeErrors}</pre>
            </details>
          )}
          {b.phase === "fail" && (
            <details>
              <summary>Build failed{b.attempt > 0 ? ` (fix ${b.attempt})` : ""}</summary>
              <pre>{b.log}</pre>
            </details>
          )}
        </div>
      ))}
      {live && a.text && <p className="live-text">{a.text}</p>}
      {a.error && <p className="error" role="alert">{a.error}</p>}
    </div>
  );
}

interface Props {
  messages: Message[];
  live: Activity | null;
  activity: Record<number, Activity>;
  disabled: boolean;
  onSend: (prompt: string) => void;
  onPickVersion: (seq: number) => void;
}

export default function Chat({ messages, live, activity, disabled, onSend, onPickVersion }: Props) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages.length, live?.text, live?.tools.length, live?.builds.length]);

  return (
    <aside className="chat" aria-label="Chat">
      <div className="chat-scroll" aria-live="polite">
        {messages.length === 0 && !live && (
          <p className="chat-empty">Tell Kiln what this site is for. Name, audience, sections and a colour are a good start.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg msg-${m.role}`}>
            {m.role === "assistant" && activity[m.id] && <ActivityLog a={activity[m.id]} live={false} />}
            <p>{m.content}</p>
            {m.versionSeq && (
              <button className="msg-version" onClick={() => onPickVersion(m.versionSeq!)}>View v{m.versionSeq}</button>
            )}
          </div>
        ))}
        {live && (
          <>
            <div className="msg msg-user"><p>{live.prompt}</p></div>
            <div className="msg msg-assistant msg-live"><ActivityLog a={live} live /></div>
          </>
        )}
        <div ref={end} />
      </div>
      <Composer disabled={disabled} placeholder={disabled ? "Kiln is working" : "Ask for a change"} submitLabel="Send" onSubmit={onSend} />
    </aside>
  );
}
