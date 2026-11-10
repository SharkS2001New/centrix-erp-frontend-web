import { apiFetchBlob, apiRequest, apiUploadForm } from "@/lib/api";
import { runQueuedTask } from "@/lib/background-task";

const BASE = "/admin/platform-marketing-portfolios";

export const PORTFOLIO_FONTS = [
  { id: "sans", label: "Modern Sans", css: "Arial, Helvetica, sans-serif" },
  { id: "serif", label: "Classic Serif", css: "Georgia, 'Times New Roman', serif" },
  { id: "mono", label: "Technical Mono", css: "'Courier New', monospace" },
];

export function portfolioFontCss(fontFamily) {
  return PORTFOLIO_FONTS.find((font) => font.id === fontFamily)?.css || PORTFOLIO_FONTS[0].css;
}

export const PORTFOLIO_STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-700",
  ready: "bg-emerald-100 text-emerald-800",
  shared: "bg-indigo-100 text-indigo-800",
};

export function portfolioStatusLabel(status) {
  return (
    {
      draft: "Draft",
      ready: "Ready",
      shared: "Shared",
    }[status] || status || "Draft"
  );
}

export async function fetchMarketingMeta() {
  return apiRequest(`${BASE}/meta`);
}

export async function listMarketingPortfolios(params = {}) {
  const searchParams = {};
  if (params.status && params.status !== "all") searchParams.status = params.status;
  if (params.vertical && params.vertical !== "all") searchParams.vertical = params.vertical;
  if (params.q) searchParams.q = params.q;
  const res = await apiRequest(BASE, { searchParams });
  return res.data ?? [];
}

export async function getMarketingPortfolio(id) {
  return apiRequest(`${BASE}/${id}`);
}

export async function createMarketingPortfolio(body) {
  return apiRequest(BASE, { method: "POST", body });
}

export async function updateMarketingPortfolio(id, body) {
  return apiRequest(`${BASE}/${id}`, { method: "PATCH", body });
}

export async function deleteMarketingPortfolio(id) {
  return apiRequest(`${BASE}/${id}`, { method: "DELETE" });
}

export async function generateMarketingPortfolio(id, body = {}, opts = {}) {
  return runQueuedTask(
    () =>
      apiRequest(`${BASE}/${id}/generate`, {
        method: "POST",
        body,
      }),
    {
      timeoutMs: 180_000,
      intervalMs: 1200,
      ...opts,
    },
  );
}

export async function regenerateMarketingSection(id, body, opts = {}) {
  return runQueuedTask(
    () =>
      apiRequest(`${BASE}/${id}/regenerate-section`, {
        method: "POST",
        body,
      }),
    {
      timeoutMs: 120_000,
      intervalMs: 1000,
      ...opts,
    },
  );
}

export async function shareMarketingPortfolio(id) {
  return apiRequest(`${BASE}/${id}/share`, { method: "POST", body: {} });
}

export async function downloadMarketingPortfolioPdf(id, filename = "Centrix-Portfolio.pdf") {
  const blob = await fetchMarketingPortfolioPdf(id);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function fetchMarketingPortfolioPdf(id) {
  return apiFetchBlob(`${BASE}/${id}/pdf`);
}

export async function downloadSharedMarketingPortfolioPdf(token, title = "Centrix-Portfolio") {
  const blob = await apiFetchBlob(`/marketing-portfolios/shared/${token}/pdf`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^A-Za-z0-9._-]+/g, "-") || "Centrix-Portfolio"}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function uploadMarketingPortfolioImage(id, image) {
  return apiUploadForm(`${BASE}/${id}/images`, { image });
}

export async function fetchMarketingPortfolioImage(id, path) {
  const params = new URLSearchParams({ path });
  return apiFetchBlob(`${BASE}/${id}/image?${params.toString()}`);
}

export async function fetchSharedMarketingPortfolio(token) {
  return apiRequest(`/marketing-portfolios/shared/${token}`, { token: null });
}

export function illustrationStyle(meta, imageKey) {
  const row = meta?.illustrations?.[imageKey] || meta?.illustrations?.ill_manager;
  const gradient = row?.gradient || ["#4C5BA4", "#2DB88A"];
  return {
    background: `linear-gradient(135deg, ${gradient[0]} 0%, ${gradient[1]} 100%)`,
    label: row?.label || imageKey,
    hint: row?.hint || "",
  };
}
