import { useEffect, useMemo, useRef, useState } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { oneDark } from "@codemirror/theme-one-dark";
import { api } from "../api";

const language = (path: string) =>
  path.endsWith(".css") ? css() : path.endsWith(".html") ? html() : javascript({ jsx: true, typescript: /\.tsx?$/.test(path) });

export default function CodeView({ projectId, seq }: { projectId: string; seq: number }) {
  const [files, setFiles] = useState<Record<string, string> | null>(null);
  const [selected, setSelected] = useState("src/App.tsx");
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => { api.version(projectId, seq).then((v) => setFiles(v.files)); }, [projectId, seq]);

  const paths = useMemo(() => Object.keys(files ?? {}).sort(), [files]);
  const current = files && (files[selected] !== undefined ? selected : paths[0]);

  useEffect(() => {
    if (!host.current || !files || !current) return;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: files[current],
        extensions: [basicSetup, language(current), oneDark, EditorState.readOnly.of(true), EditorView.lineWrapping],
      }),
    });
    return () => view.destroy();
  }, [files, current]);

  if (!files) return <div className="center-note">Loading files</div>;

  return (
    <div className="code">
      <nav className="file-tree" aria-label="Files">
        {paths.map((p) => {
          const depth = p.split("/").length - 1;
          return (
            <button
              key={p}
              className="file"
              aria-current={p === current}
              style={{ paddingLeft: 12 + depth * 14 }}
              onClick={() => setSelected(p)}
              title={p}
            >
              {depth > 0 && <span className="file-dir">{p.split("/").slice(0, -1).join("/")}/</span>}
              {p.split("/").pop()}
            </button>
          );
        })}
      </nav>
      <div className="editor" ref={host} aria-label={`Contents of ${current}`} />
    </div>
  );
}
