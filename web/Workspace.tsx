import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { api, streamChat, type AgentEvent, type Config, type ProjectDetail } from "./api";
import { ModeBadge } from "./Home";
import Chat, { type Activity } from "./components/Chat";
import DiffView from "./components/DiffView";
import { Mark } from "./components/Mark";
import Preview from "./components/Preview";
import Timeline from "./components/Timeline";

// CodeMirror is the bulk of the bundle; load it only when the Code tab opens.
const CodeView = lazy(() => import("./components/CodeView"));

type Tab = "preview" | "code" | "changes";

const emptyActivity = (prompt: string): Activity => ({ prompt, status: "", plan: [], tools: [], text: "", builds: [], error: null });

function reduce(a: Activity, e: AgentEvent): Activity {
  switch (e.type) {
    case "status": return { ...a, status: e.message };
    case "plan": return { ...a, plan: e.steps };
    case "text": return { ...a, text: a.text + e.delta };
    case "tool": return { ...a, tools: [...a.tools, e] };
    case "build": return { ...a, builds: e.phase === "start" ? [...a.builds, e] : [...a.builds.slice(0, -1), e] };
    case "error": return { ...a, error: e.message };
    default: return a;
  }
}

export default function Workspace({ id, config, initialPrompt, onHome }: { id: string; config: Config | null; initialPrompt: string | null; onHome: () => void }) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewSeq, setViewSeq] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("preview");
  const [live, setLive] = useState<Activity | null>(null);
  const [activity, setActivity] = useState<Record<number, Activity>>({});
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.project(id);
      setDetail(d);
      setViewSeq(d.project.head);
      document.title = `${d.project.name} · Kiln`;
      return d;
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [id]);

  const send = useCallback(async (prompt: string) => {
    let current = emptyActivity(prompt);
    setLive(current);
    try {
      await streamChat(id, prompt, (e) => {
        current = reduce(current, e);
        setLive(current);
      });
    } catch (e) {
      current = { ...current, error: (e as Error).message };
    }
    const d = await load();
    // Keep this turn's plan/tool log next to the assistant reply it produced.
    const reply = d?.messages.at(-1);
    if (reply?.role === "assistant") setActivity((prev) => ({ ...prev, [reply.id]: current }));
    setLive(null);
  }, [id, load]);

  useEffect(() => {
    load().then((d) => { if (d && initialPrompt && d.messages.length === 0) send(initialPrompt); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  if (loadError) return <div className="center-note"><p>{loadError}</p><button className="btn" onClick={onHome}>Back to your sites</button></div>;
  if (!detail || viewSeq === null) return <div className="center-note"><Mark firing /> Opening project</div>;

  const { project, versions, messages } = detail;
  const viewed = versions.find((v) => v.seq === viewSeq) ?? versions.at(-1)!;
  const building = live !== null;

  async function restore() {
    setRestoring(true);
    try {
      await api.restore(id, viewed.seq);
      await load();
    } finally {
      setRestoring(false);
    }
  }

  async function rename() {
    const name = prompt("Rename site", project.name);
    if (name?.trim()) { await api.rename(id, name); await load(); }
  }

  return (
    <div className="workspace">
      <header className="topbar">
        <button className="brand brand-btn" onClick={onHome} aria-label="All sites"><Mark firing={building} /> Kiln</button>
        <button className="project-title" onClick={rename} title="Rename">{project.name}</button>
        <div className="topbar-right">
          {config && <ModeBadge config={config} />}
          <a className="btn" href={`/api/projects/${id}/export.zip?seq=${viewed.seq}`} download>Download v{viewed.seq} as zip</a>
        </div>
      </header>

      <Chat messages={messages} live={live} activity={activity} disabled={building} onSend={send} onPickVersion={(s) => { setViewSeq(s); setTab("preview"); }} />

      <section className="stage" aria-label="Workspace">
        <div className="stage-bar">
          <div className="tabs" role="tablist">
            {(["preview", "code", "changes"] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className="tab" onClick={() => setTab(t)}>
                {t === "preview" ? "Preview" : t === "code" ? "Code" : "Changes"}
              </button>
            ))}
          </div>
          <div className="stage-meta">
            {viewed.seq !== project.head && (
              <>
                <span className="viewing-old">Viewing v{viewed.seq}, current is v{project.head}</span>
                <button className="btn btn-primary" onClick={restore} disabled={restoring || building}>
                  {restoring ? "Restoring" : `Restore v${viewed.seq}`}
                </button>
              </>
            )}
          </div>
        </div>
        <div className="stage-body">
          {tab === "preview" && <Preview projectId={id} version={viewed} />}
          {tab === "code" && <Suspense fallback={<div className="center-note">Loading editor</div>}><CodeView projectId={id} seq={viewed.seq} /></Suspense>}
          {tab === "changes" && <DiffView projectId={id} seq={viewed.seq} />}
        </div>
        <Timeline versions={versions} head={project.head} selected={viewed.seq} firing={building} onSelect={setViewSeq} />
      </section>
    </div>
  );
}
