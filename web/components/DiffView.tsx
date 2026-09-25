import { useEffect, useState } from "react";
import { api, type FileDiff } from "../api";

export default function DiffView({ projectId, seq }: { projectId: string; seq: number }) {
  const [diff, setDiff] = useState<FileDiff[] | null>(null);
  useEffect(() => { setDiff(null); api.diff(projectId, seq).then(setDiff); }, [projectId, seq]);

  if (!diff) return <div className="center-note">Loading changes</div>;
  if (diff.length === 0) return <div className="center-note">v{seq} has the same files as v{seq - 1}.</div>;

  const count = (d: FileDiff, c: string) => d.hunks.reduce((n, h) => n + h.lines.filter((l) => l[0] === c).length, 0);
  return (
    <div className="diff">
      <p className="diff-summary">
        {seq === 1 ? "Files in v1" : `Changes from v${seq - 1} to v${seq}`}: {diff.length} {diff.length === 1 ? "file" : "files"}
      </p>
      {diff.map((d) => (
        <details key={d.path} className="diff-file" open={diff.length <= 4}>
          <summary>
            <span className={`diff-status diff-${d.status}`}>{d.status}</span>
            <code>{d.path}</code>
            <span className="diff-counts"><ins>+{count(d, "+")}</ins> <del>−{count(d, "-")}</del></span>
          </summary>
          {d.hunks.map((h, i) => (
            <pre key={i} className="hunk">
              {h.lines.map((l, j) => (
                <span key={j} className={l[0] === "+" ? "ln-add" : l[0] === "-" ? "ln-del" : "ln-ctx"}>{l}{"\n"}</span>
              ))}
            </pre>
          ))}
        </details>
      ))}
    </div>
  );
}
