"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Download } from "lucide-react";
import { PortfolioPreview } from "@/components/platform/platform-marketing-preview";
import {
  downloadPortfolioPdf,
  renderMarketingPortfolioCanvas,
} from "@/components/platform/platform-marketing-export";
import {
  fetchSharedMarketingPortfolio,
} from "@/lib/platform-marketing";

export default function PublicMarketingPortfolioPage() {
  const { token } = useParams();
  const [portfolio, setPortfolio] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  async function downloadPdf() {
    if (!portfolio || downloading) return;
    setDownloading(true);
    setDownloadError("");
    try {
      const canvas = await renderMarketingPortfolioCanvas(portfolio, meta, null);
      downloadPortfolioPdf(canvas, portfolio.title);
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : "Could not download the portfolio PDF.");
    } finally {
      setDownloading(false);
    }
  }

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
    <div className="h-dvh overflow-y-auto overscroll-y-contain bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Centrix</p>
            <p className="text-sm text-slate-500">Business portfolio</p>
          </div>
          <div className="flex items-center gap-4">
            {!loading && !error && portfolio ? (
              <button
                type="button"
                onClick={downloadPdf}
                disabled={downloading}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:cursor-wait disabled:opacity-60"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                {downloading ? "Preparing PDF…" : "Download PDF"}
              </button>
            ) : null}
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
      </div>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {loading ? <p className="text-sm text-slate-500">Loading portfolio…</p> : null}
        {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p> : null}
        {downloadError ? (
          <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {downloadError}
          </p>
        ) : null}
        {!loading && !error && portfolio ? (
          <PortfolioPreview portfolio={portfolio} meta={meta} />
        ) : null}
      </main>
    </div>
  );
}
