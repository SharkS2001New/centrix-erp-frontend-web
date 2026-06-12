"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

const sections = ["sales", "inventory", "finance", "operations"];

const REPORT_UI_ROUTES = {
  "eod-report": "/sales/end-of-day",
  "eod-cashier": "/sales/end-of-day",
};

export default function ReportsPage() {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiRequest("/reports/")
      .then(setCatalog)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  const base = process.env.NEXT_PUBLIC_API_URL ?? "";

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Reports</h1>
      <p className="mt-1 text-sm text-slate-400">
        Catalog from GET /reports/ — call endpoints from Postman or extend UI
      </p>

      {error && (
        <p className="mt-4 text-sm text-red-300">{error}</p>
      )}

      {catalog && (
        <div className="mt-8 space-y-8">
          {sections.map((section) => {
            const items = catalog[section];
            if (!items?.length) return null;
            return (
              <section key={section}>
                <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
                  {section}
                </h2>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((r) => {
                    const uiHref = REPORT_UI_ROUTES[r.key];
                    return (
                    <li
                      key={r.key}
                      className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3"
                    >
                      <p className="font-medium text-slate-200">{r.label}</p>
                      {uiHref ? (
                        <Link href={uiHref} className="mt-1 inline-block text-xs font-medium text-[#185FA5] hover:underline">
                          Open report →
                        </Link>
                      ) : null}
                      <p className="mt-1 font-mono text-xs text-emerald-400/80">
                        GET {base}
                        {r.path}
                      </p>
                    </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
