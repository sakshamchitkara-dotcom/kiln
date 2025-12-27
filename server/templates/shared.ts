import type { Files } from "../vfs.ts";

export interface TemplateOptions {
  name: string;
  accent: string; // hex
  dark?: boolean;
}

export const ACCENTS: Record<string, string> = {
  red: "#dc2626",
  orange: "#ea580c",
  amber: "#d97706",
  yellow: "#ca8a04",
  lime: "#65a30d",
  green: "#16a34a",
  emerald: "#059669",
  teal: "#0d9488",
  cyan: "#0891b2",
  blue: "#2563eb",
  indigo: "#4f46e5",
  violet: "#7c3aed",
  purple: "#9333ea",
  pink: "#db2777",
  rose: "#e11d48",
  black: "#171717",
};

const LIGHT = { paper: "#ffffff", ink: "#171717", muted: "#737373", line: "#e5e5e5", panel: "#fafafa" };
const DARK = { paper: "#0f1115", ink: "#f5f5f5", muted: "#a3a3a3", line: "#262a33", panel: "#171a21" };

/** Theme tokens live in one CSS file so colour and dark-mode edits touch one place. */
export function themeCss(opts: TemplateOptions, font: string): string {
  const c = opts.dark ? DARK : LIGHT;
  return `@import "tailwindcss";

@theme {
  --color-accent: ${opts.accent};
  --color-paper: ${c.paper};
  --color-ink: ${c.ink};
  --color-muted: ${c.muted};
  --color-line: ${c.line};
  --color-panel: ${c.panel};
  --font-sans: "${font}", ui-sans-serif, system-ui, sans-serif;
}

body {
  background: var(--color-paper);
  color: var(--color-ink);
}
`;
}

export function indexHtml(title: string, fontQuery: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${fontQuery}&display=swap" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

export const MAIN_TSX = `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`;

export const content = (obj: unknown) => `// Site copy lives here so text edits never touch layout code.\nexport const site = ${JSON.stringify(obj, null, 2)} as const;\n`;

export type Template = (opts: TemplateOptions) => Files;
