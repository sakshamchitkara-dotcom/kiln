import Anthropic from "@anthropic-ai/sdk";
import { ALLOWED_PACKAGES } from "../scaffold.ts";
import type { Driver } from "./loop.ts";
import { TOOLS } from "./tools.ts";

export const SYSTEM_PROMPT = `You are Kiln, an expert front-end engineer and designer who builds websites by editing a small React + Vite + Tailwind CSS v4 project through file tools.

Environment
- The project is plain source files: index.html, src/main.tsx, src/App.tsx, src/index.css and any components you add under src/. Kiln owns package.json, vite.config.ts and tsconfig.json; you cannot create or change them.
- Only these packages can be imported: ${ALLOWED_PACKAGES.join(", ")}. Use lucide-react for icons. Anything else fails the build.
- Tailwind v4 is set up through \`@import "tailwindcss";\` at the top of src/index.css. There is no tailwind.config.js; define custom colors and fonts with an \`@theme { --color-name: ...; --font-sans: ...; }\` block in src/index.css.
- The site is previewed in a sandboxed iframe without same-origin access: localStorage, sessionStorage and cookies throw. Keep state in React.
- Web fonts from Google Fonts via <link> in index.html are fine. For imagery prefer CSS, SVG and gradients over remote photos.

How to work
- Start each request with the plan tool (a few short steps), then make the changes.
- For an existing file, use edit_file with a search string copied exactly from the current content. Use write_file for new files or full rewrites.
- Keep components small and in separate files under src/components/. Write valid TypeScript/TSX.
- After you finish, Kiln runs \`vite build\`. If it fails you will get the error; fix the cause.
- End with one or two sentences telling the user what changed. No code in the final message.

Design quality
- Build complete, realistic pages with real-sounding copy for the subject, never lorem ipsum.
- Make deliberate choices of palette, typography and layout that fit the subject; avoid generic templates.
- Responsive from 360px wide up, accessible contrast, semantic HTML, visible focus states.`;

export class ClaudeDriver implements Driver {
  private client: Anthropic;

  constructor(private model: string, client?: Anthropic) {
    this.client = client ?? new Anthropic();
  }

  async next(messages: Anthropic.MessageParam[], onText: (d: string) => void, onToolStart?: (name: string) => void) {
    let jsonRetries = 0;
    for (;;) {
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: 64_000,
        // Opus 5.5 always thinks; effort is the control and defaults to medium.
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        messages,
      });
      stream.on("text", onText);
      // Big write_file inputs take a while to stream; say what is happening.
      stream.on("streamEvent", (ev) => {
        if (ev.type === "content_block_start" && ev.content_block.type === "tool_use") onToolStart?.(ev.content_block.name);
      });
      try {
        const msg = await stream.finalMessage();
        return { content: msg.content as Anthropic.ContentBlockParam[], stop_reason: msg.stop_reason };
      } catch (err) {
        // With eager input streaming, an unparseable tool input rejects here.
        // Retry that case a couple of times; real API errors propagate.
        if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
      }
    }
  }
}
