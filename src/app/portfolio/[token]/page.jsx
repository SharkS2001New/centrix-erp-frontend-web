"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PortfolioPreview } from "@/components/platform/platform-marketing-preview";
import { fetchSharedMarketingPortfolio } from "@/lib/platform-marketing";

export default function PublicMarketingPortfolioPage() {
  const { token } = useParams();
  const [portfolio, setPortfolio] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetchSharedMarketingPortfolio(token);
        if (cancelled) return;
        setPortfolio(res.data);
        setMeta(res.meta);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Portfolio not found.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Centrix</p>
            <p className="text-sm text-slate-500">Business portfolio</p>
          </div>
          <a
            href="https://centrix.co.ke"
            className="text-sm font-medium text-indigo-700 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            Learn more
          </a>
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {loading ? <p className="text-sm text-slate-500">Loading portfolio…</p> : null}
        {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p> : null}
        {!loading && !error && portfolio ? (
          <PortfolioPreview portfolio={portfolio} meta={meta} />
        ) : null}
      </main>
    </div>
  );
}
