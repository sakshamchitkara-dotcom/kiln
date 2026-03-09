import { useEffect, useState } from "react";
import { api, type Config, type Project } from "./api";
import Composer from "./components/Composer";
import { Mark } from "./components/Mark";

const EXAMPLES = [
  'A landing page called "Crumb" for a neighbourhood bakery, green accent',
  "An analytics dashboard for a coffee roaster",
  "A blog named Field Notes about birdwatching, dark theme",
];

export default function Home({ config, onOpen }: { config: Config | null; onOpen: (id: string, prompt?: string) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.projects().then(setProjects).catch(() => {}); }, []);

  async function start(body: { name?: string; template?: string }, prompt?: string) {
    setBusy(true);
    setError(null);
    try {
      const p = await api.create(body);
      onOpen(p.id, prompt);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="home">
      <header className="home-top">
        <span className="brand"><Mark /> Kiln</span>
        {config && <ModeBadge config={config} />}
      </header>
      <main className="home-main">
        <h1 className="home-title">Describe a website.<br />Kiln builds it.</h1>
        <p className="home-lede">You get a React, Vite and Tailwind project that builds cleanly, a live preview, and every version kept.</p>
        <Composer
          big
          disabled={busy}
          placeholder="A one-page site for a ceramics studio with class schedules and a booking form"
          submitLabel="Build site"
          onSubmit={(prompt) => start({ name: prompt.match(/called\s+"?([^",.]+)/i)?.[1] ?? "Untitled site" }, prompt)}
        />
        {error && <p className="error" role="alert">{error}</p>}
        <div className="examples" aria-label="Example prompts">
          {EXAMPLES.map((e) => (
            <button key={e} className="chip" disabled={busy} onClick={() => start({ name: e.match(/"([^"]+)"|named (\w+ \w+)/)?.slice(1).find(Boolean) ?? "Untitled site" }, e)}>
              {e}
            </button>
          ))}
        </div>

        <section className="home-section">
          <h2>Or start from a template</h2>
          <div className="templates">
            {config?.templates.map((t) => (
              <button key={t.id} className={`template template-${t.id}`} disabled={busy} onClick={() => start({ template: t.id })}>
                <span className="template-glaze" aria-hidden />
                <strong>{t.label}</strong>
                <span>{t.description}</span>
              </button>
            ))}
          </div>
        </section>

        {projects.length > 0 && (
          <section className="home-section">
            <h2>Your sites</h2>
            <ul className="project-list">
              {projects.map((p) => (
                <li key={p.id}>
                  <a href={`/p/${p.id}`} onClick={(e) => { e.preventDefault(); onOpen(p.id); }}>
                    <span className="project-name">{p.name}</span>
                    <span className="project-meta">{p.head} {p.head === 1 ? "version" : "versions"}, started {new Date(p.createdAt).toLocaleDateString()}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

export function ModeBadge({ config }: { config: Config }) {
  return config.mode === "scripted" ? (
    <span className="mode mode-scripted" title="No ANTHROPIC_API_KEY set. An offline generator handles a fixed set of requests.">Offline scripted mode</span>
  ) : (
    <span className="mode">{config.model}</span>
  );
}
