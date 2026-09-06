import type Anthropic from "@anthropic-ai/sdk";
import { ACCENTS, TEMPLATES } from "../templates/index.ts";
import type { Files } from "../vfs.ts";
import type { Driver } from "./loop.ts";

// Offline stand-in for Claude. It turns a prompt into the same tool calls the
// real model makes (plan, write_file, edit_file), so the whole pipeline (VFS,
// build, auto-fix, versions, preview) runs and tests without an API key.

type Op =
  | { tool: "write_file"; path: string; content: string }
  | { tool: "edit_file"; path: string; search: string; replace: string };

export interface Script { plan: string[]; ops: Op[]; summary: string; fix?: Op[] }

const quoted = /["“']([^"”']{2,80})["”']/;
const colorIn = (p: string) => Object.keys(ACCENTS).find((c) => new RegExp(`\\b${c}\\b`, "i").test(p));

export function pickTemplate(prompt: string): keyof typeof TEMPLATES {
  if (/dashboard|admin|analytics|metrics|kpi|saas app|crm/i.test(prompt)) return "dashboard";
  if (/blog|journal|essays?|articles?|newsletter|writing|posts/i.test(prompt)) return "blog";
  return "landing";
}

export function extractName(prompt: string): string | undefined {
  const m = prompt.match(/\b(?:called|named)\s+["“']?([A-Za-z0-9][\w&' -]{1,40}?)["”']?(?=[,.;!]|\s+(?:that|with|for|and|to|which)\b|$)/i) ?? prompt.match(quoted);
  return m?.[1].trim();
}

const SECTIONS: Record<string, { file: string; component: string; code: string }> = {
  testimonials: {
    file: "src/components/Testimonials.tsx",
    component: "Testimonials",
    code: `const quotes = [
  { quote: "We replaced three tools with this and nobody misses them.", name: "Priya Nair", role: "Head of Operations" },
  { quote: "The first product our whole team adopted without a rollout plan.", name: "Tom Becker", role: "Engineering Lead" },
  { quote: "Setup took an afternoon. The time back took a week to notice.", name: "Lena Ortiz", role: "Founder" },
];

export default function Testimonials() {
  return (
    <section id="testimonials" className="mx-auto max-w-6xl px-6 py-20">
      <h2 className="text-3xl font-extrabold tracking-tight">What people say</h2>
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {quotes.map((q) => (
          <figure key={q.name} className="rounded-2xl border border-line p-6">
            <blockquote className="text-lg">“{q.quote}”</blockquote>
            <figcaption className="mt-6 text-sm">
              <span className="font-semibold">{q.name}</span>
              <span className="block text-muted">{q.role}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
`,
  },
  faq: {
    file: "src/components/Faq.tsx",
    component: "Faq",
    code: `const items = [
  { q: "Is there a free plan?", a: "Yes. Up to three people can use it free, forever." },
  { q: "Can I cancel any time?", a: "Yes. Paid plans are monthly and you can cancel from settings." },
  { q: "Where is my data stored?", a: "In encrypted storage in the EU, backed up daily." },
];

export default function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl px-6 py-20">
      <h2 className="text-3xl font-extrabold tracking-tight">Questions</h2>
      <div className="mt-8 divide-y divide-line border-y border-line">
        {items.map((i) => (
          <details key={i.q} className="group py-5">
            <summary className="cursor-pointer list-none font-semibold group-open:text-accent">{i.q}</summary>
            <p className="mt-3 text-muted">{i.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
`,
  },
  pricing: {
    file: "src/components/Pricing.tsx",
    component: "Pricing",
    code: `const plans = [
  { name: "Starter", price: "$0", note: "For trying it out", perks: ["3 members", "Core features", "Community support"] },
  { name: "Team", price: "$12", note: "Per member, per month", perks: ["Unlimited members", "Integrations", "Priority support"], featured: true },
  { name: "Business", price: "$24", note: "Per member, per month", perks: ["SSO and audit log", "Custom roles", "Dedicated manager"] },
];

export default function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-6 py-20">
      <h2 className="text-3xl font-extrabold tracking-tight">Pricing</h2>
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {plans.map((p) => (
          <div key={p.name} className={"rounded-2xl p-6 " + (p.featured ? "bg-accent text-white" : "border border-line")}>
            <h3 className="font-semibold">{p.name}</h3>
            <p className="mt-4 text-4xl font-extrabold">{p.price}</p>
            <p className={"text-sm " + (p.featured ? "text-white/80" : "text-muted")}>{p.note}</p>
            <ul className="mt-6 space-y-2 text-sm">
              {p.perks.map((perk) => <li key={perk}>{perk}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
`,
  },
};

function replaceJsonField(content: string, field: string, value: string): Op | undefined {
  const m = content.match(new RegExp(`"${field}": "(?:[^"\\\\]|\\\\.)*"`));
  if (!m) return undefined;
  return { tool: "edit_file", path: "src/content.ts", search: m[0], replace: `"${field}": ${JSON.stringify(value)}` };
}

export function planScript(prompt: string, files: Files): Script {
  const color = colorIn(prompt);
  const dark = /\bdark\b/i.test(prompt);

  // Fresh project: generate from the closest template.
  if (!files["src/content.ts"]) {
    const id = pickTemplate(prompt);
    const t = TEMPLATES[id];
    const name = extractName(prompt) ?? t.defaultName;
    const accent = color ? ACCENTS[color] : t.accent;
    const out = t.build({ name, accent, dark });
    const script: Script = {
      plan: [
        `Use a ${t.label.toLowerCase()} layout for "${name}"`,
        `Set the theme tokens${color ? ` with a ${color} accent` : ""}${dark ? " on a dark background" : ""}`,
        "Write the site copy to src/content.ts",
        "Build each section as its own component",
      ],
      ops: Object.entries(out).map(([path, content]) => ({ tool: "write_file", path, content })),
      summary: `Built a ${t.label.toLowerCase()} for ${name}: ${t.description.toLowerCase()}.`,
    };
    return withSimulatedFailure(prompt, script, files);
  }

  const plan: string[] = [];
  const ops: Op[] = [];
  const done: string[] = [];
  let css = files["src/index.css"] ?? "";
  const copy = files["src/content.ts"];

  if (color && /colou?r|accent|theme|brand|make it|switch|change|use/i.test(prompt)) {
    const m = css.match(/--color-accent: [^;]+;/);
    if (m) {
      plan.push(`Change the accent token to ${color}`);
      ops.push({ tool: "edit_file", path: "src/index.css", search: m[0], replace: `--color-accent: ${ACCENTS[color]};` });
      css = css.replace(m[0], `--color-accent: ${ACCENTS[color]};`);
      done.push(`switched the accent colour to ${color}`);
    }
  }

  if (/\b(dark|light)\b/i.test(prompt) && /mode|theme|background|make it/i.test(prompt)) {
    const toDark = dark;
    const tokens = toDark
      ? { paper: "#0f1115", ink: "#f5f5f5", muted: "#a3a3a3", line: "#262a33", panel: "#171a21" }
      : { paper: "#ffffff", ink: "#171717", muted: "#737373", line: "#e5e5e5", panel: "#fafafa" };
    let next = css;
    for (const [k, v] of Object.entries(tokens)) next = next.replace(new RegExp(`--color-${k}: [^;]+;`), `--color-${k}: ${v};`);
    if (next !== css) {
      plan.push(`Swap the base tokens to a ${toDark ? "dark" : "light"} palette`);
      ops.push({ tool: "edit_file", path: "src/index.css", search: css, replace: next });
      done.push(`switched to a ${toDark ? "dark" : "light"} theme`);
    }
  }

  const q = prompt.match(quoted)?.[1];
  if (q && /headline|title|heading|hero/i.test(prompt)) {
    const op = replaceJsonField(copy, "headline", q);
    if (op) { plan.push("Update the headline in src/content.ts"); ops.push(op); done.push(`changed the headline to “${q}”`); }
  } else if (q && /rename|call it|name it|brand name/i.test(prompt)) {
    const op = replaceJsonField(copy, "name", q);
    if (op) { plan.push("Rename the site in src/content.ts"); ops.push(op); done.push(`renamed the site to ${q}`); }
  }

  let app = files["src/App.tsx"] ?? "";
  if (/runtime error/i.test(prompt) && app.includes(RUNTIME_BUG)) {
    plan.push("Find the render-time crash in src/App.tsx", "Remove the read of an undefined global");
    ops.push({ tool: "edit_file", path: "src/App.tsx", search: RUNTIME_BUG, replace: "" });
    app = app.replace(RUNTIME_BUG, "");
    done.push("removed the read of window.kilnVisits that crashed the first render");
  }
  for (const [key, s] of Object.entries(SECTIONS)) {
    if (!new RegExp(key.replace(/s$/, ""), "i").test(prompt) || files[s.file]) continue;
    plan.push(`Add a ${key} section`);
    ops.push({ tool: "write_file", path: s.file, content: s.code });
    const withImport = `import ${s.component} from "./components/${s.component}";\n` + app;
    const next = withImport.replace(/\n(\s*)<\/main>/, (_, indent) => `\n${indent}  <${s.component} />\n${indent}</main>`);
    ops.push({ tool: "edit_file", path: "src/App.tsx", search: app, replace: next });
    app = next;
    done.push(`added a ${key} section`);
  }

  if (ops.length === 0) {
    return {
      plan: ["Match the request against scripted edits"],
      ops: [],
      summary:
        "Scripted mode is offline and only knows a few edits: change the accent colour (\"make it green\"), switch to a dark or light theme, set the headline (headline \"...\"), rename the site (rename to \"...\"), or add testimonials, pricing or FAQ sections. Set ANTHROPIC_API_KEY for free-form requests.",
    };
  }
  const summary = done.join(", ").replace(/^./, (c) => c.toUpperCase()) + ".";
  return withSimulatedFailure(prompt, { plan, ops, summary }, files);
}

// Builds and type-checks, then throws on first render inside the preview.
const RUNTIME_BUG = "  const visits = (window as unknown as { kilnVisits: number[] }).kilnVisits.length; // simulated runtime error\n";
const APP_START = "export default function App() {\n";

function withSimulatedFailure(prompt: string, script: Script, files: Files): Script {
  if (/simulate a runtime error/i.test(prompt)) {
    const ops = script.ops.map((o) =>
      o.tool === "write_file" && o.path === "src/App.tsx" ? { ...o, content: o.content.replace(APP_START, APP_START + RUNTIME_BUG) } : o);
    if (!script.ops.some((o) => o.path === "src/App.tsx") && files["src/App.tsx"]?.includes(APP_START)) {
      ops.push({ tool: "edit_file", path: "src/App.tsx", search: APP_START, replace: APP_START + RUNTIME_BUG });
    }
    return { ...script, ops };
  }
  if (/simulate a type error/i.test(prompt)) {
    // Bundles fine (Vite strips types) but fails tsc, so only the type check catches it.
    const path = "src/lib/format.ts";
    const ok = `export const formatCount = (n: number): string => n.toLocaleString("en-US");\n`;
    return {
      ...script,
      ops: [...script.ops, { tool: "write_file", path, content: `export const formatCount = (n: number): string => n;\n` }],
      fix: [{ tool: "write_file", path, content: ok }],
    };
  }
  // "simulate a build error" exercises the auto-fix loop offline: the first write
  // ships a syntax error, and the fix arrives after Kiln reports the failed build.
  if (!/simulate a build error/i.test(prompt)) return script;
  const good = script.ops.find((o) => o.tool === "write_file" && o.path === "src/App.tsx") as Extract<Op, { tool: "write_file" }> | undefined;
  const base = good?.content ?? files["src/App.tsx"] ?? "";
  const broken = base.replace("return (", "return (\n    <div>");
  const ops = script.ops.filter((o) => o !== good);
  ops.push({ tool: "write_file", path: "src/App.tsx", content: broken });
  return { ...script, ops, fix: [{ tool: "write_file", path: "src/App.tsx", content: base }] };
}

let seq = 0;
const toolUse = (op: Op | { tool: "plan"; steps: string[] }): Anthropic.ToolUseBlockParam => {
  const { tool, ...input } = op;
  return { type: "tool_use", id: `toolu_scripted_${++seq}`, name: tool, input };
};

export class ScriptedDriver implements Driver {
  private stage = 0;
  private fixed = false;

  constructor(private script: Script, private delayMs = 0) {}

  static fromPrompt(prompt: string, files: Files, delayMs = 0) {
    return new ScriptedDriver(planScript(prompt, files), delayMs);
  }

  private async say(text: string, onText: (d: string) => void) {
    for (const word of text.match(/\S+\s*/g) ?? []) {
      onText(word);
      if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    }
  }

  async next(messages: Anthropic.MessageParam[], onText: (d: string) => void) {
    const last = messages[messages.length - 1];
    const buildFailed = typeof last.content === "string" && last.content.startsWith("The build");
    if (buildFailed && this.script.fix && !this.fixed) {
      this.fixed = true;
      const text = String(last.content).includes("TypeScript")
        ? "TypeScript caught formatCount returning a number. Converting it to a string."
        : "The build caught a stray <div> in App.tsx. Removing it.";
      await this.say(text, onText);
      return { content: [{ type: "text" as const, text }, ...this.script.fix.map(toolUse)], stop_reason: "tool_use" };
    }
    if (this.stage++ === 0 && this.script.ops.length > 0) {
      const text = "Here is the plan.";
      await this.say(text, onText);
      return {
        content: [{ type: "text" as const, text }, toolUse({ tool: "plan", steps: this.script.plan }), ...this.script.ops.map(toolUse)],
        stop_reason: "tool_use",
      };
    }
    const text = buildFailed ? "Fixed the build error." : this.script.summary;
    await this.say(text, onText);
    return { content: [{ type: "text" as const, text }], stop_reason: "end_turn" };
  }
}
