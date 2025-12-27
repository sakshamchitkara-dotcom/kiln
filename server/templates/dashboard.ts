import { MAIN_TSX, content, indexHtml, themeCss, type Template } from "./shared.ts";

export const dashboard: Template = (opts) => ({
  "index.html": indexHtml(opts.name, "Inter+Tight:wght@400;500;600;700"),
  "src/main.tsx": MAIN_TSX,
  "src/index.css": themeCss(opts, "Inter Tight"),
  "src/content.ts": content({
    name: opts.name,
    headline: "Good morning, here is how the week is going",
    nav: ["Overview", "Orders", "Customers", "Products", "Settings"],
    kpis: [
      { label: "Revenue", value: "$48,210", change: 12.4 },
      { label: "Orders", value: "1,284", change: 4.1 },
      { label: "Refund rate", value: "1.8%", change: -0.6 },
      { label: "New customers", value: "312", change: 9.3 },
    ],
    weekly: [
      { day: "Mon", value: 5200 },
      { day: "Tue", value: 6100 },
      { day: "Wed", value: 5800 },
      { day: "Thu", value: 7400 },
      { day: "Fri", value: 8900 },
      { day: "Sat", value: 7600 },
      { day: "Sun", value: 7210 },
    ],
    orders: [
      { id: "#4821", customer: "Maya Chen", total: "$212.00", status: "Paid" },
      { id: "#4820", customer: "Jonas Weber", total: "$89.50", status: "Shipped" },
      { id: "#4819", customer: "Amara Okafor", total: "$340.00", status: "Paid" },
      { id: "#4818", customer: "Luis Ortega", total: "$56.20", status: "Refunded" },
      { id: "#4817", customer: "Sofia Rossi", total: "$128.75", status: "Shipped" },
    ],
  }),
  "src/App.tsx": `import Sidebar from "./components/Sidebar";
import Kpis from "./components/Kpis";
import RevenueChart from "./components/RevenueChart";
import OrdersTable from "./components/OrdersTable";
import { site } from "./content";

export default function App() {
  return (
    <div className="flex min-h-screen bg-panel text-ink">
      <Sidebar />
      <main className="flex-1 space-y-6 p-6 lg:p-10">
        <h1 className="text-2xl font-semibold tracking-tight">{site.headline}</h1>
        <Kpis />
        <div className="grid gap-6 xl:grid-cols-5">
          <RevenueChart />
          <OrdersTable />
        </div>
      </main>
    </div>
  );
}
`,
  "src/components/Sidebar.tsx": `import { BarChart3 } from "lucide-react";
import { site } from "../content";

export default function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-line bg-paper p-6 md:block">
      <div className="flex items-center gap-2 font-bold">
        <BarChart3 className="text-accent" size={22} /> {site.name}
      </div>
      <nav className="mt-10 space-y-1 text-sm">
        {site.nav.map((item, i) => (
          <a
            key={item}
            href="#"
            className={"block rounded-md px-3 py-2 " + (i === 0 ? "bg-accent/10 font-semibold text-accent" : "text-muted hover:text-ink")}
          >
            {item}
          </a>
        ))}
      </nav>
    </aside>
  );
}
`,
  "src/components/Kpis.tsx": `import { TrendingDown, TrendingUp } from "lucide-react";
import { site } from "../content";

export default function Kpis() {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {site.kpis.map((k) => {
        const up = k.change >= 0;
        const Icon = up ? TrendingUp : TrendingDown;
        return (
          <div key={k.label} className="rounded-xl border border-line bg-paper p-5">
            <p className="text-sm text-muted">{k.label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{k.value}</p>
            <p className={"mt-2 inline-flex items-center gap-1 text-sm " + (up ? "text-emerald-600" : "text-rose-600")}>
              <Icon size={16} /> {Math.abs(k.change)}% vs last week
            </p>
          </div>
        );
      })}
    </section>
  );
}
`,
  "src/components/RevenueChart.tsx": `import { site } from "../content";

export default function RevenueChart() {
  const max = Math.max(...site.weekly.map((d) => d.value));
  return (
    <section className="rounded-xl border border-line bg-paper p-5 xl:col-span-3">
      <h2 className="font-semibold">Revenue this week</h2>
      <div className="mt-6 flex h-56 items-end gap-3">
        {site.weekly.map((d) => (
          <div key={d.day} className="flex flex-1 flex-col items-center gap-2">
            <div
              className="w-full rounded-t-md bg-accent"
              style={{ height: (d.value / max) * 100 + "%" }}
              title={"$" + d.value.toLocaleString()}
            />
            <span className="text-xs text-muted">{d.day}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
`,
  "src/components/OrdersTable.tsx": `import { site } from "../content";

const tone: Record<string, string> = {
  Paid: "bg-emerald-100 text-emerald-800",
  Shipped: "bg-sky-100 text-sky-800",
  Refunded: "bg-rose-100 text-rose-800",
};

export default function OrdersTable() {
  return (
    <section className="overflow-x-auto rounded-xl border border-line bg-paper p-5 xl:col-span-2">
      <h2 className="font-semibold">Recent orders</h2>
      <table className="mt-4 w-full text-left text-sm">
        <thead className="text-muted">
          <tr><th className="py-2 font-medium">Order</th><th className="font-medium">Customer</th><th className="font-medium">Total</th><th className="font-medium">Status</th></tr>
        </thead>
        <tbody>
          {site.orders.map((o) => (
            <tr key={o.id} className="border-t border-line">
              <td className="py-3 tabular-nums">{o.id}</td>
              <td>{o.customer}</td>
              <td className="tabular-nums">{o.total}</td>
              <td><span className={"rounded-full px-2 py-0.5 text-xs font-medium " + tone[o.status]}>{o.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
`,
});
