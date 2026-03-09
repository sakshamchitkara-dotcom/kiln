import type { VersionMeta } from "../api";

interface Props {
  versions: VersionMeta[];
  head: number;
  selected: number;
  firing: boolean;
  onSelect: (seq: number) => void;
}

/** Version history as a row of glaze test tiles, oldest on the left. */
export default function Timeline({ versions, head, selected, firing, onSelect }: Props) {
  return (
    <nav className="timeline" aria-label="Version history">
      <ol>
        {versions.map((v) => (
          <li key={v.seq}>
            <button
              className={`tile ${v.buildOk ? "tile-ok" : "tile-failed"} ${v.seq === head ? "tile-head" : ""}`}
              aria-current={v.seq === selected ? "true" : undefined}
              aria-label={`Version ${v.seq}: ${v.summary}${v.buildOk ? "" : " (build failed)"}${v.seq === head ? " (current)" : ""}`}
              onClick={() => onSelect(v.seq)}
            >
              <span className="tile-seq">v{v.seq}</span>
            </button>
            <span className="tile-tip" role="tooltip">{v.summary}</span>
          </li>
        ))}
        {firing && (
          <li>
            <span className="tile tile-firing" aria-label="Building the next version"><span className="tile-seq">v{versions.length + 1}</span></span>
          </li>
        )}
      </ol>
      <p className="timeline-caption">
        {versions.find((v) => v.seq === selected)?.summary}
      </p>
    </nav>
  );
}
