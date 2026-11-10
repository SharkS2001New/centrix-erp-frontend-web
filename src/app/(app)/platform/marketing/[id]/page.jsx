"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { ApiError, resolveCustomerMediaUrl } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell, PrimaryButton, SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";
import {
  createPortfolioPdfBlob,
  downloadPortfolioPdf,
  PortfolioPngPreview,
  downloadPortfolioPng,
  renderMarketingPortfolioCanvas,
} from "@/components/platform/platform-marketing-export";
import { PortfolioPreview } from "@/components/platform/platform-marketing-preview";
import {
  generateMarketingPortfolio,
  getMarketingPortfolio,
  PORTFOLIO_STATUS_STYLES,
  PORTFOLIO_FONTS,
  portfolioStatusLabel,
  regenerateMarketingSection,
  shareMarketingPortfolio,
  uploadMarketingPortfolioImage,
  updateMarketingPortfolio,
} from "@/lib/platform-marketing";

export default function MarketingPortfolioEditorPage() {
  const { id } = useParams();
  const router = useRouter();
  const [portfolio, setPortfolio] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("brief");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [exportView, setExportView] = useState("document");
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");
  const [pngError, setPngError] = useState("");
  const pngCanvasRef = useRef(null);
  const pngSourceRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMarketingPortfolio(id);
      setPortfolio(res.data);
      setMeta(res.meta);
      if (res.data?.share_token) {
        setShareUrl(`${window.location.origin}/portfolio/${res.data.share_token}`);
      }
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load portfolio.");
      router.push("/platform/marketing");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const vertical = useMemo(
    () => meta?.verticals?.find((v) => v.id === portfolio?.vertical),
    [meta, portfolio?.vertical],
  );

  function patchField(key, value) {
    setPortfolio((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function patchSection(index, key, value) {
    setPortfolio((prev) => {
      if (!prev) return prev;
      const sections = [...(prev.sections || [])];
      sections[index] = { ...sections[index], [key]: value };
      return { ...prev, sections };
    });
  }

  function portfolioPayload() {
    return {
      title: portfolio.title,
      prospect_name: portfolio.prospect_name,
      prospect_contact: portfolio.prospect_contact,
      prospect_email: portfolio.prospect_email,
      prospect_phone: portfolio.prospect_phone,
      business_name: portfolio.business_name,
      location: portfolio.location,
      business_size: portfolio.business_size,
      branch_count: portfolio.branch_count,
      till_count: portfolio.till_count,
      pain_points: portfolio.pain_points,
      focus_modules: portfolio.focus_modules,
      tone: portfolio.tone,
      vertical: portfolio.vertical,
      industry: vertical?.industry || portfolio.industry,
      template_key: portfolio.template_key || "modern",
      font_family: portfolio.font_family || "sans",
      hero_image_key: portfolio.hero_image_key,
      sections: portfolio.sections,
    };
  }

  const onPngRendered = useCallback((canvas, error, source) => {
    pngCanvasRef.current = canvas;
    pngSourceRef.current = canvas ? source : null;
    setPngError(error?.message || "");
  }, []);

  useEffect(
    () => () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    },
    [pdfPreviewUrl],
  );

  async function saveBrief() {
    setBusy("save");
    try {
      const res = await updateMarketingPortfolio(id, portfolioPayload());
      setPortfolio(res.data);
      notifySuccess("Saved.");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Save failed.");
    } finally {
      setBusy("");
    }
  }

  async function onGenerate() {
    setBusy("generate");
    try {
      await updateMarketingPortfolio(id, portfolioPayload());
      const res = await generateMarketingPortfolio(id, {
        instruction: instruction || undefined,
      });
      setPortfolio(res.data);
      setTab("preview");
      notifySuccess(res.message || "Portfolio generated.");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Generate failed.");
    } finally {
      setBusy("");
    }
  }

  async function onRegenSection(sectionKey) {
    setBusy(`section:${sectionKey}`);
    try {
      await updateMarketingPortfolio(id, portfolioPayload());
      const res = await regenerateMarketingSection(id, {
        section_key: sectionKey,
        instruction: instruction || undefined,
      });
      setPortfolio(res.data);
      notifySuccess("Section regenerated.");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Section regenerate failed.");
    } finally {
      setBusy("");
    }
  }

  async function onShare() {
    setBusy("share");
    try {
      const saved = await updateMarketingPortfolio(id, portfolioPayload());
      setPortfolio(saved.data);
      const res = await shareMarketingPortfolio(id);
      setPortfolio(res.data);
      const url = `${window.location.origin}${res.share_path}`;
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        notifySuccess("Share link copied.");
      } catch {
        notifySuccess("Share link ready.");
      }
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Share failed.");
    } finally {
      setBusy("");
    }
  }

  async function onPdf() {
    setBusy("pdf");
    try {
      const saved = await updateMarketingPortfolio(id, portfolioPayload());
      setPortfolio(saved.data);
      const canvas = await renderMarketingPortfolioCanvas(saved.data, meta, id);
      downloadPortfolioPdf(canvas, saved.data.title);
      notifySuccess("PDF downloaded.");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "PDF failed.");
    } finally {
      setBusy("");
    }
  }

  async function onPng() {
    setBusy("png");
    try {
      const saved = await updateMarketingPortfolio(id, portfolioPayload());
      setPortfolio(saved.data);
      const canvas = await renderMarketingPortfolioCanvas(saved.data, meta, id);
      await downloadPortfolioPng(canvas, saved.data.title);
      notifySuccess("PNG downloaded.");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "PNG failed.");
    } finally {
      setBusy("");
    }
  }

  async function onPdfPreview() {
    setBusy("pdf-preview");
    try {
      const saved = await updateMarketingPortfolio(id, portfolioPayload());
      setPortfolio(saved.data);
      const canvas = await renderMarketingPortfolioCanvas(saved.data, meta, id);
      const blob = createPortfolioPdfBlob(canvas);
      const nextUrl = URL.createObjectURL(blob);
      setPdfPreviewUrl(nextUrl);
      setExportView("pdf");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not prepare PDF preview.");
    } finally {
      setBusy("");
    }
  }

  async function onSectionImageUpload(index, sectionKey, file) {
    if (!file) return;
    setBusy(`upload:${sectionKey}`);
    try {
      const res = await uploadMarketingPortfolioImage(id, file);
      patchSection(index, "image_path", res.data.path);
      patchSection(index, "image_url", res.data.url);
      const sizeKb = Math.max(1, Math.round((res.data.size || 0) / 1024));
      notifySuccess(`Image compressed and uploaded (${sizeKb} KB). Save section edits to keep it.`);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Image upload failed.");
    } finally {
      setBusy("");
    }
  }

  if (loading || !portfolio) {
    return (
      <CatalogPageShell title="Marketing portfolio" description="Loading…">
        <p className="text-sm text-slate-500">Loading portfolio…</p>
      </CatalogPageShell>
    );
  }

  return (
    <CatalogPageShell
      title={portfolio.title}
      subtitle={`${portfolio.prospect_name}${portfolio.business_name ? ` · ${portfolio.business_name}` : ""}`}
      action={
        <div className="flex flex-wrap gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
              PORTFOLIO_STATUS_STYLES[portfolio.status] || PORTFOLIO_STATUS_STYLES.draft
            }`}
          >
            {portfolioStatusLabel(portfolio.status)}
          </span>
          <button type="button" className={SECONDARY_BTN_CLASS} disabled={!!busy} onClick={() => void saveBrief()}>
            {busy === "save" ? "Saving…" : "Save"}
          </button>
          <PrimaryButton disabled={!!busy} onClick={() => void onGenerate()}>
            {busy === "generate" ? "Generating (queued)…" : "Generate portfolio"}
          </PrimaryButton>
          <button type="button" className={SECONDARY_BTN_CLASS} disabled={!!busy} onClick={() => void onShare()}>
            Share link
          </button>
          <button type="button" className={SECONDARY_BTN_CLASS} disabled={!!busy} onClick={() => void onPdf()}>
            {busy === "pdf" ? "Preparing PDF…" : "Download PDF"}
          </button>
          <button type="button" className={SECONDARY_BTN_CLASS} disabled={!!busy} onClick={() => void onPng()}>
            {busy === "png" ? "Preparing PNG…" : "Download PNG"}
          </button>
        </div>
      }
    >
      <AdminBreadcrumb
        items={[
          { label: "Platform", href: "/platform" },
          { label: "Marketing portfolios", href: "/platform/marketing" },
          { label: portfolio.title || `#${id}` },
        ]}
      />

      {shareUrl ? (
        <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          Share URL:{" "}
          <a href={shareUrl} target="_blank" rel="noreferrer" className="font-medium underline">
            {shareUrl}
          </a>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ["brief", "Brief"],
          ["sections", "Sections"],
          ["preview", "Preview"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
              tab === key ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="mb-4 block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Instruction (optional)</span>
        <input
          className="w-full rounded-lg border border-slate-200 px-3 py-2"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="e.g. Emphasise multi-till EOD — or leave blank for a general vertical portfolio"
        />
      </label>

      {tab === "brief" ? (
        <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 md:grid-cols-2">
          <Field label="Title" value={portfolio.title || ""} onChange={(v) => patchField("title", v)} />
          <Field label="Prospect" value={portfolio.prospect_name || ""} onChange={(v) => patchField("prospect_name", v)} />
          <Field label="Business" value={portfolio.business_name || ""} onChange={(v) => patchField("business_name", v)} />
          <Field label="Location" value={portfolio.location || ""} onChange={(v) => patchField("location", v)} />
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Vertical</span>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
              value={portfolio.vertical}
              onChange={(e) => {
                const v = meta?.verticals?.find((row) => row.id === e.target.value);
                patchField("vertical", e.target.value);
                if (v?.hero_image_key) patchField("hero_image_key", v.hero_image_key);
                if (v?.default_modules) patchField("focus_modules", v.default_modules);
              }}
            >
              {(meta?.verticals || []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Portfolio font</span>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
              value={portfolio.font_family || "sans"}
              onChange={(e) => patchField("font_family", e.target.value)}
            >
              {(meta?.fonts || PORTFOLIO_FONTS).map((font) => (
                <option key={font.id} value={font.id}>{font.label}</option>
              ))}
            </select>
          </label>
          <div className="md:col-span-2">
            <p className="mb-2 text-sm font-medium text-slate-700">Portfolio template</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {(meta?.templates || [
                { id: "modern", label: "Modern", description: "Clean, balanced layout." },
                { id: "editorial", label: "Editorial", description: "Refined and minimal." },
                { id: "bold", label: "Bold", description: "High contrast, energetic sections." },
              ]).map((template) => {
                const selected = (portfolio.template_key || "modern") === template.id;
                const palette = {
                  modern: "from-blue-700 to-emerald-500",
                  editorial: "from-teal-900 to-amber-700",
                  bold: "from-violet-900 to-orange-500",
                }[template.id] || "from-slate-700 to-slate-400";
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => patchField("template_key", template.id)}
                    className={`overflow-hidden rounded-xl border text-left transition ${
                      selected ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-200 hover:border-slate-400"
                    }`}
                    aria-pressed={selected}
                  >
                    <span className={`block h-3 bg-gradient-to-r ${palette}`} />
                    <span className="block p-3">
                      <span className="block text-sm font-semibold text-slate-900">{template.label}</span>
                      <span className="mt-1 block text-xs text-slate-600">{template.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Tone</span>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
              value={portfolio.tone || "professional"}
              onChange={(e) => patchField("tone", e.target.value)}
            >
              {(meta?.tones || []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Branches"
            value={portfolio.branch_count ?? ""}
            onChange={(v) => patchField("branch_count", v === "" ? null : Number(v))}
          />
          <Field
            label="Tills / outlets"
            value={portfolio.till_count ?? ""}
            onChange={(v) => patchField("till_count", v === "" ? null : Number(v))}
          />
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block font-medium text-slate-700">Pain points</span>
            <textarea
              rows={4}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
              value={portfolio.pain_points || ""}
              onChange={(e) => patchField("pain_points", e.target.value)}
            />
          </label>
          <div className="md:col-span-2">
            <p className="mb-2 text-sm font-medium text-slate-700">Focus modules</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(meta?.modules || {}).map(([mid, label]) => {
                const on = (portfolio.focus_modules || []).includes(mid);
                return (
                  <button
                    key={mid}
                    type="button"
                    onClick={() => {
                      const set = new Set(portfolio.focus_modules || []);
                      if (set.has(mid)) set.delete(mid);
                      else set.add(mid);
                      patchField("focus_modules", [...set]);
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      on ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "sections" ? (
        <div className="space-y-4">
          {(portfolio.sections || []).map((section, index) => (
            <div key={section.key || index} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-900">{section.title || section.key}</h3>
                <button
                  type="button"
                  className={SECONDARY_BTN_CLASS}
                  disabled={!!busy}
                  onClick={() => void onRegenSection(section.key)}
                >
                  {busy === `section:${section.key}` ? "Regenerating…" : "Regenerate section"}
                </button>
              </div>
              <Field
                label="Title"
                value={section.title || ""}
                onChange={(v) => patchSection(index, "title", v)}
              />
              <label className="mt-3 block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Body</span>
                <textarea
                  rows={5}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  value={section.body || ""}
                  onChange={(e) => patchSection(index, "body", e.target.value)}
                />
              </label>
              <label className="mt-3 block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Bullets (one per line)</span>
                <textarea
                  rows={4}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  value={(section.bullets || []).join("\n")}
                  onChange={(e) =>
                    patchSection(
                      index,
                      "bullets",
                      e.target.value
                        .split("\n")
                        .map((l) => l.trim())
                        .filter(Boolean),
                    )
                  }
                />
              </label>
              <label className="mt-3 block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Illustration</span>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  value={section.image_key || "ill_manager"}
                  onChange={(e) => patchSection(index, "image_key", e.target.value)}
                >
                  {Object.entries(meta?.illustrations || {}).map(([key, row]) => (
                    <option key={key} value={key}>
                      {row.label || key}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/70 p-4">
                <p className="text-sm font-semibold text-indigo-950">Ideas for this section</p>
                <ul className="mt-2 space-y-2 text-sm text-indigo-900">
                  {(meta?.section_suggestions?.[portfolio.vertical]?.[section.key] || []).map((suggestion) => (
                    <li key={suggestion} className="flex gap-2">
                      <span className="mt-0.5 text-indigo-500" aria-hidden="true">•</span>
                      <span>{suggestion}</span>
                    </li>
                  ))}
                  {!meta?.section_suggestions?.[portfolio.vertical]?.[section.key]?.length ? (
                    <li>Keep the content specific to this prospect and only describe verified Centrix capabilities.</li>
                  ) : null}
                </ul>
              </div>
              <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Section photo</p>
                  <p className="mt-1 text-xs text-slate-500">Upload a JPEG, PNG, or WebP up to 10 MB.</p>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <label className={`${SECONDARY_BTN_CLASS} cursor-pointer text-center`}>
                    {busy === `upload:${section.key}` ? "Uploading…" : section.image_path || section.image_url ? "Replace photo" : "Upload photo"}
                    <input
                      className="sr-only"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={!!busy}
                      onChange={(event) => {
                        void onSectionImageUpload(index, section.key, event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                  </label>
                </div>
                {section.image_path || section.image_url ? (
                  <div className="relative h-48 w-full sm:col-span-2 sm:max-w-sm">
                    <Image
                      src={resolveCustomerMediaUrl(section.image_path) || resolveCustomerMediaUrl(section.image_url)}
                      alt={`Section image for ${section.title || section.key}`}
                      fill
                      sizes="(max-width: 640px) 100vw, 384px"
                      unoptimized
                      className="rounded-lg object-cover"
                    />
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          <button type="button" className={SECONDARY_BTN_CLASS} disabled={!!busy} onClick={() => void saveBrief()}>
            Save section edits
          </button>
        </div>
      ) : null}

      {tab === "preview" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Export preview</p>
              <p className="text-xs text-slate-500">PDF and PNG share the same artwork; the PDF paginates it for A4.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={exportView === "document" ? "rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white" : SECONDARY_BTN_CLASS}
                onClick={() => setExportView("document")}
              >
                Document
              </button>
              <button
                type="button"
                className={exportView === "pdf" ? "rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white" : SECONDARY_BTN_CLASS}
                disabled={!!busy}
                onClick={() => void onPdfPreview()}
              >
                {busy === "pdf-preview" ? "Preparing…" : "Preview PDF"}
              </button>
              <button
                type="button"
                className={exportView === "png" ? "rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white" : SECONDARY_BTN_CLASS}
                onClick={() => setExportView("png")}
              >
                Preview PNG
              </button>
              <button type="button" className={SECONDARY_BTN_CLASS} disabled={!!busy} onClick={() => void onPdf()}>
                Download PDF
              </button>
              <button type="button" className={SECONDARY_BTN_CLASS} disabled={!!busy} onClick={() => void onPng()}>
                Download PNG
              </button>
            </div>
          </div>
          {exportView === "document" ? <PortfolioPreview portfolio={portfolio} meta={meta} /> : null}
          {exportView === "pdf" ? (
            pdfPreviewUrl ? (
              <iframe
                src={pdfPreviewUrl}
                title="Generated portfolio PDF preview"
                className="h-[75vh] w-full rounded-xl border border-slate-200 bg-slate-100"
              />
            ) : (
              <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                Choose Preview PDF to generate a document from your latest edits.
              </p>
            )
          ) : null}
          {exportView === "png" ? (
            <div className="space-y-3">
              {pngError ? <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{pngError}</p> : null}
              <PortfolioPngPreview
                portfolio={portfolio}
                meta={meta}
                portfolioId={id}
                canvasRef={pngCanvasRef}
                onRendered={onPngRendered}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </CatalogPageShell>
  );
}

function Field({ label, value, onChange }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <input
        className="w-full rounded-lg border border-slate-200 px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
