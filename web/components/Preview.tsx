import { useEffect, useState } from "react";
import { api } from "../api";
import type { VersionMeta } from "../api";

const DEVICES = [
  { id: "desktop", label: "Desktop", width: "100%" },
  { id: "tablet", label: "Tablet", width: "820px" },
  { id: "phone", label: "Phone", width: "390px" },
] as const;

export default function Preview({ projectId, version }: { projectId: string; version: VersionMeta }) {
  const [device, setDevice] = useState<(typeof DEVICES)[number]["id"]>("desktop");
  const [reload, setReload] = useState(0);
  const src = `/preview/${projectId}/${version.seq}/`;
  const width = DEVICES.find((d) => d.id === device)!.width;

  return (
    <div className="preview">
      <div className="preview-bar">
        <div className="segmented" role="group" aria-label="Preview size">
          {DEVICES.map((d) => (
            <button key={d.id} aria-pressed={device === d.id} onClick={() => setDevice(d.id)}>{d.label}</button>
          ))}
        </div>
        <div className="preview-actions">
          <button className="link-btn" onClick={() => setReload((n) => n + 1)}>Reload</button>
          {version.buildOk && <a className="link-btn" href={src} target="_blank" rel="noreferrer">Open in new tab</a>}
        </div>
      </div>
      <div className="preview-shelf">
        {version.buildOk ? (
          <iframe
            key={`${src}#${reload}`}
            title={`Preview of version ${version.seq}`}
            src={src}
            style={{ width }}
            // No allow-same-origin: the generated site can't reach Kiln's origin.
            sandbox="allow-scripts allow-forms allow-popups allow-modals"
          />
        ) : (
          <BuildLog projectId={projectId} seq={version.seq} />
        )}
      </div>
    </div>
  );
}

function BuildLog({ projectId, seq }: { projectId: string; seq: number }) {
  const [log, setLog] = useState<string | null>(null);
  useEffect(() => { api.version(projectId, seq).then((v) => setLog(v.buildLog)).catch((e) => setLog(e.message)); }, [projectId, seq]);
  return (
    <div className="build-broken">
      <h2>v{seq} did not build</h2>
      <p>Ask for a fix in the chat, or pick an earlier version below.</p>
      <pre>{log}</pre>
    </div>
  );
}
