"use client";

import { useAuth } from "@/contexts/auth-context";

export default function DashboardPage() {
  const { user, capabilities } = useAuth();
  const modules = capabilities?.modules ?? {};
  const enabled = Object.entries(modules).filter(([, on]) => on);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
      <p className="mt-1 text-slate-400">
        Welcome, {user?.full_name ?? user?.username}
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card title="Deployment">
          <p className="text-lg font-medium text-white">
            {capabilities?.profile_label}
          </p>
          <p className="text-sm text-slate-500">{capabilities?.deployment_profile}</p>
        </Card>
        <Card title="Sales channels">
          <p className="text-sm text-slate-300">
            {(capabilities?.channels ?? []).join(", ") || "—"}
          </p>
        </Card>
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Enabled modules
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {enabled.map(([key]) => (
            <li
              key={key}
              className="rounded-full bg-emerald-600/15 px-3 py-1 text-xs font-medium text-emerald-300"
            >
              {key}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}
