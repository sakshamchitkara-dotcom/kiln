import { blog } from "./blog.ts";
import { dashboard } from "./dashboard.ts";
import { landing } from "./landing.ts";
import type { Template } from "./shared.ts";

export { ACCENTS, themeCss, type TemplateOptions } from "./shared.ts";

export const TEMPLATES: Record<string, { label: string; description: string; defaultName: string; accent: string; build: Template }> = {
  landing: { label: "Landing page", description: "Hero, features, stats and a call to action", defaultName: "Tandem", accent: "#4f46e5", build: landing },
  dashboard: { label: "Dashboard", description: "KPIs, a revenue chart and recent orders", defaultName: "Ledger", accent: "#0d9488", build: dashboard },
  blog: { label: "Blog", description: "Featured essay, archive and newsletter signup", defaultName: "Slow Notes", accent: "#e11d48", build: blog },
};
