import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const api = `http://localhost:${process.env.PORT ?? 8787}`;

// Config for Kiln's own UI. Generated projects are built by server/build-worker.mjs
// with an inline config and never read this file.
export default defineConfig({
  root: "web",
  plugins: [react()],
  build: { outDir: "../dist", emptyOutDir: true, chunkSizeWarningLimit: 800 },
  server: { port: 5173, proxy: { "/api": api, "/preview": api } },
});
