import type { Files } from "./vfs.ts";

/** Packages generated projects may import. Everything else fails the build. */
export const ALLOWED_PACKAGES = ["react", "react-dom", "lucide-react"] as const;

/** Files every new project starts from. The model owns all of these afterwards. */
export const BASE_FILES: Files = {
  "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>New site</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  "src/main.tsx": `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`,
  "src/index.css": `@import "tailwindcss";
`,
  "src/App.tsx": `export default function App() {
  return (
    <main className="min-h-screen grid place-items-center bg-white text-neutral-500">
      <p>Describe your site to get started.</p>
    </main>
  );
}
`,
};

/** Config files Kiln owns. Added on export so the zip runs with `npm i && npm run dev`. */
export function withProjectConfig(files: Files, name: string): Files {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "kiln-site";
  return {
    ...files,
    "package.json": JSON.stringify(
      {
        name: slug,
        private: true,
        version: "0.0.0",
        type: "module",
        scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
        dependencies: { react: "^19.0.0", "react-dom": "^19.0.0", "lucide-react": "^1.0.0" },
        devDependencies: {
          "@tailwindcss/vite": "^4.0.0",
          "@vitejs/plugin-react": "^6.0.0",
          tailwindcss: "^4.0.0",
          vite: "^8.0.0",
        },
      },
      null,
      2,
    ) + "\n",
    "vite.config.ts": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({ plugins: [react(), tailwindcss()] });
`,
    "tsconfig.json": JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022", module: "ESNext", moduleResolution: "bundler", jsx: "react-jsx",
          strict: true, noEmit: true, skipLibCheck: true, lib: ["ES2022", "DOM", "DOM.Iterable"],
        },
        include: ["src"],
      },
      null,
      2,
    ) + "\n",
  };
}
