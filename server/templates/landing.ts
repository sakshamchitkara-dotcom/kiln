import { MAIN_TSX, content, indexHtml, themeCss, type Template } from "./shared.ts";

export const landing: Template = (opts) => ({
  "index.html": indexHtml(opts.name, "Manrope:wght@400;500;700;800"),
  "src/main.tsx": MAIN_TSX,
  "src/index.css": themeCss(opts, "Manrope"),
  "src/content.ts": content({
    name: opts.name,
    headline: `${opts.name} makes the busy part of your week feel light`,
    subhead: "Plan, share and ship from one calm workspace. Set up in five minutes, no training needed.",
    cta: "Start free",
    secondaryCta: "See how it works",
    features: [
      { title: "One shared plan", body: "Everyone sees the same priorities, updated the moment they change." },
      { title: "Fewer meetings", body: "Async check-ins replace the status meeting nobody wanted." },
      { title: "Clear hand-offs", body: "Every task has an owner, a due date and the context to finish it." },
    ],
    stats: [
      { value: "12k", label: "teams onboard" },
      { value: "4.9", label: "average rating" },
      { value: "6 hrs", label: "saved per person, weekly" },
    ],
    closing: "Ready when you are.",
  }),
  "src/App.tsx": `import Nav from "./components/Nav";
import Hero from "./components/Hero";
import Features from "./components/Features";
import Closing from "./components/Closing";
import Footer from "./components/Footer";

export default function App() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <Nav />
      <main>
        <Hero />
        <Features />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}
`,
  "src/components/Nav.tsx": `import { site } from "../content";

export default function Nav() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
      <a href="#" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
        <span className="inline-block h-6 w-6 rounded-md bg-accent" aria-hidden />
        {site.name}
      </a>
      <nav className="hidden gap-8 text-sm text-muted sm:flex">
        <a href="#features" className="hover:text-ink">Features</a>
        <a href="#start" className="hover:text-ink">Pricing</a>
      </nav>
      <a href="#start" className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper">{site.cta}</a>
    </header>
  );
}
`,
  "src/components/Hero.tsx": `import { ArrowRight } from "lucide-react";
import { site } from "../content";

export default function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 sm:pt-24">
      <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">{site.headline}</h1>
      <p className="mt-6 max-w-xl text-lg text-muted">{site.subhead}</p>
      <div className="mt-10 flex flex-wrap gap-3">
        <a href="#start" className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 font-semibold text-white">
          {site.cta} <ArrowRight size={18} />
        </a>
        <a href="#features" className="rounded-full border border-line px-6 py-3 font-semibold">{site.secondaryCta}</a>
      </div>
      <dl className="mt-16 grid max-w-2xl grid-cols-3 gap-6 border-t border-line pt-8">
        {site.stats.map((s) => (
          <div key={s.label}>
            <dt className="text-sm text-muted">{s.label}</dt>
            <dd className="text-3xl font-extrabold">{s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
`,
  "src/components/Features.tsx": `import { CalendarCheck, MessagesSquare, Share2 } from "lucide-react";
import { site } from "../content";

const icons = [CalendarCheck, MessagesSquare, Share2];

export default function Features() {
  return (
    <section id="features" className="bg-panel py-20">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 md:grid-cols-3">
        {site.features.map((f, i) => {
          const Icon = icons[i % icons.length];
          return (
            <article key={f.title}>
              <Icon className="text-accent" size={28} />
              <h2 className="mt-4 text-xl font-bold">{f.title}</h2>
              <p className="mt-2 text-muted">{f.body}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
`,
  "src/components/Closing.tsx": `import { site } from "../content";

export default function Closing() {
  return (
    <section id="start" className="mx-auto max-w-6xl px-6 py-24 text-center">
      <h2 className="text-3xl font-extrabold sm:text-5xl">{site.closing}</h2>
      <a href="#" className="mt-8 inline-block rounded-full bg-accent px-8 py-4 font-semibold text-white">{site.cta}</a>
    </section>
  );
}
`,
  "src/components/Footer.tsx": `import { site } from "../content";

export default function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl justify-between px-6 py-8 text-sm text-muted">
        <span>© {new Date().getFullYear()} {site.name}</span>
        <a href="#" className="hover:text-ink">Privacy</a>
      </div>
    </footer>
  );
}
`,
});
