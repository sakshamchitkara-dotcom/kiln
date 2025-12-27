import { MAIN_TSX, content, indexHtml, themeCss, type Template } from "./shared.ts";

export const blog: Template = (opts) => ({
  "index.html": indexHtml(opts.name, "Literata:opsz,wght@7..72,400;7..72,600;7..72,800"),
  "src/main.tsx": MAIN_TSX,
  "src/index.css": themeCss(opts, "Literata"),
  "src/content.ts": content({
    name: opts.name,
    headline: "Notes on building slowly and well",
    subhead: "Essays on craft, tools and the long middle of making things. A new piece most Sundays.",
    featured: {
      title: "The case for boring tools",
      excerpt: "Every new tool promises speed. The ones that last give you something better: nothing to think about.",
      date: "Sep 21",
      minutes: 7,
    },
    posts: [
      { title: "What a year of daily sketching taught me", date: "Sep 14", minutes: 5 },
      { title: "Writing the README first", date: "Sep 7", minutes: 4 },
      { title: "On finishing things", date: "Aug 31", minutes: 6 },
      { title: "A small garden, a long season", date: "Aug 24", minutes: 3 },
    ],
    newsletter: "Get the Sunday essay by email",
  }),
  "src/App.tsx": `import Masthead from "./components/Masthead";
import Featured from "./components/Featured";
import PostList from "./components/PostList";
import Newsletter from "./components/Newsletter";

export default function App() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-3xl px-6">
        <Masthead />
        <main>
          <Featured />
          <PostList />
          <Newsletter />
        </main>
      </div>
    </div>
  );
}
`,
  "src/components/Masthead.tsx": `import { site } from "../content";

export default function Masthead() {
  return (
    <header className="border-b border-line py-12">
      <a href="#" className="text-sm font-semibold text-accent">{site.name}</a>
      <h1 className="mt-4 text-4xl font-extrabold leading-tight sm:text-5xl">{site.headline}</h1>
      <p className="mt-4 text-lg text-muted">{site.subhead}</p>
    </header>
  );
}
`,
  "src/components/Featured.tsx": `import { site } from "../content";

export default function Featured() {
  const p = site.featured;
  return (
    <article className="py-12">
      <p className="text-sm text-muted">{p.date} · {p.minutes} min read</p>
      <h2 className="mt-2 text-3xl font-semibold">
        <a href="#" className="decoration-accent decoration-2 underline-offset-4 hover:underline">{p.title}</a>
      </h2>
      <p className="mt-4 text-lg leading-relaxed">{p.excerpt}</p>
    </article>
  );
}
`,
  "src/components/PostList.tsx": `import { site } from "../content";

export default function PostList() {
  return (
    <section className="border-t border-line py-8">
      <h2 className="sr-only">More essays</h2>
      <ul>
        {site.posts.map((p) => (
          <li key={p.title} className="flex items-baseline justify-between gap-6 border-b border-line py-5">
            <a href="#" className="text-lg font-semibold hover:text-accent">{p.title}</a>
            <span className="shrink-0 text-sm text-muted">{p.date}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
`,
  "src/components/Newsletter.tsx": `import { useState } from "react";
import { site } from "../content";

export default function Newsletter() {
  const [sent, setSent] = useState(false);
  return (
    <section className="my-12 rounded-2xl bg-panel p-8">
      <h2 className="text-xl font-semibold">{site.newsletter}</h2>
      {sent ? (
        <p className="mt-4 text-accent">Thanks. Check your inbox to confirm.</p>
      ) : (
        <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={(e) => { e.preventDefault(); setSent(true); }}>
          <input required type="email" placeholder="you@example.com" className="flex-1 rounded-lg border border-line bg-paper px-4 py-3" />
          <button className="rounded-lg bg-accent px-5 py-3 font-semibold text-white">Subscribe</button>
        </form>
      )}
    </section>
  );
}
`,
});
