import { useEffect, useState } from "react";
import { api, type Config } from "./api";
import Home from "./Home";
import Workspace from "./Workspace";

const projectFromPath = () => location.pathname.match(/^\/p\/([0-9a-f-]{36})/)?.[1] ?? null;

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [projectId, setProjectId] = useState(projectFromPath);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  useEffect(() => {
    api.config().then(setConfig).catch(() => setConfig(null));
    const onPop = () => setProjectId(projectFromPath());
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  const open = (id: string | null, prompt?: string) => {
    history.pushState(null, "", id ? `/p/${id}` : "/");
    setPendingPrompt(prompt ?? null);
    setProjectId(id);
  };

  return projectId ? (
    <Workspace key={projectId} id={projectId} config={config} initialPrompt={pendingPrompt} onHome={() => open(null)} />
  ) : (
    <Home config={config} onOpen={open} />
  );
}
