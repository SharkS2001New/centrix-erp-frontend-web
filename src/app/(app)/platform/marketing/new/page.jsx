"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell, PrimaryButton, SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";
import {
  createMarketingPortfolio,
  fetchMarketingMeta,
  PORTFOLIO_FONTS,
} from "@/lib/platform-marketing";

const emptyForm = {
  prospect_name: "",
  prospect_contact: "",
  prospect_email: "",
  prospect_phone: "",
  business_name: "",
  location: "",
  business_size: "",
  branch_count: "",
  till_count: "",
  vertical: "small_shop",
  tone: "professional",
  template_key: "modern",
  font_family: "sans",
  pain_points: "",
  focus_modules: [],
  title: "",
  instruction: "",
};

export default function NewMarketingPortfolioPage() {
  const router = useRouter();
  const [meta, setMeta] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    void fetchMarketingMeta()
      .then((m) => {
        setMeta(m);
        const first = m.verticals?.[0];
        if (first) {
          setForm((prev) => ({
            ...prev,
            vertical: first.id,
            focus_modules: first.default_modules || [],
          }));
        }
      })
      .catch((e) => notifyError(e instanceof ApiError ? e.message : "Failed to load meta."));
  }, []);

  const vertical = useMemo(
    () => meta?.verticals?.find((v) => v.id === form.vertical) || null,
    [form.vertical, meta],
  );

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleModule(id) {
    setForm((prev) => {
      const set = new Set(prev.focus_modules || []);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...prev, focus_modules: [...set] };
    });
  }

  async function submit({ generateNow }) {
    setSaving(true);
    try {
      const payload = {
        ...form,
        title: form.title.trim() || undefined,
        prospect_name: form.prospect_name.trim() || undefined,
        branch_count: form.branch_count === "" ? null : Number(form.branch_count),
        till_count: form.till_count === "" ? null : Number(form.till_count),
        industry: vertical?.industry || "commerce",
        hero_image_key: vertical?.hero_image_key || undefined,
        template_key: form.template_key,
        instruction: form.instruction.trim() || undefined,
        generate_now: Boolean(generateNow),
      };
      const res = await createMarketingPortfolio(payload);
      const id = res.data?.id;
      if (res.generate_error) {
        notifyError(res.generate_error);
      } else {
        notifySuccess(res.message || (generateNow ? "Portfolio generated." : "Portfolio created."));
      }
      router.push(id ? `/platform/marketing/${id}` : "/platform/marketing");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not create portfolio.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CatalogPageShell
      title="New marketing portfolio"
      subtitle="Type a short instruction and generate — or fill a full prospect brief."
      backHref="/platform/marketing"
      backLabel="Marketing portfolios"
    >
      <AdminBreadcrumb
        items={[
          { label: "Platform", href: "/platform" },
          { label: "Marketing portfolios", href: "/platform/marketing" },
          { label: "New" },
        ]}
      />

      <div className="w-full space-y-6">
        <section className="space-y-4 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-6 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Quick generate</h2>
            <p className="mt-1 text-sm text-slate-600">
              Pick a vertical and optionally write one instruction — Centrix builds a reusable general portfolio.
              No photo assets needed; illustrated panels are included automatically.
            </p>
          </div>

          <fieldset>
            <legend className="mb-2 block text-sm font-medium text-slate-700">Choose a portfolio template</legend>
            <div className="grid gap-3 md:grid-cols-3">
              {(meta?.templates || []).map((template) => (
                <button
                  key={template.id}
                  type="button"
                  aria-pressed={form.template_key === template.id}
                  onClick={() => setField("template_key", template.id)}
                  className={`rounded-xl border p-3 text-left transition ${
                    form.template_key === template.id
                      ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                      : "border-slate-200 bg-white hover:border-slate-400"
                  }`}
                >
                  <TemplateSwatch template={template.id} />
                  <span className="mt-2 block text-sm font-semibold text-slate-900">{template.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-600">{template.description}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Vertical</span>
              <select
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
                value={form.vertical}
                onChange={(e) => {
                  const id = e.target.value;
                  const v = meta?.verticals?.find((row) => row.id === id);
                  setForm((prev) => ({
                    ...prev,
                    vertical: id,
                    focus_modules: v?.default_modules || prev.focus_modules,
                  }));
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
              <span className="mb-1 block font-medium text-slate-700">Tone</span>
              <select
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
                value={form.tone}
                onChange={(e) => setField("tone", e.target.value)}
              >
                {(meta?.tones || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Portfolio font</span>
              <select
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
                value={form.font_family}
                onChange={(e) => setField("font_family", e.target.value)}
              >
                {(meta?.fonts || PORTFOLIO_FONTS).map((font) => (
                  <option key={font.id} value={font.id}>{font.label}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Instruction</span>
            <textarea
              rows={4}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
              value={form.instruction}
              onChange={(e) => setField("instruction", e.target.value)}
              placeholder='e.g. “General Centrix portfolio for mid-size Nairobi supermarkets — emphasise multi-till EOD, stock alerts, and Manager app.”'
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Prospect name (optional)"
              value={form.prospect_name}
              onChange={(v) => setField("prospect_name", v)}
              placeholder="Defaults to Prospect"
            />
            <Field
              label="Business name (optional)"
              value={form.business_name}
              onChange={(v) => setField("business_name", v)}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <PrimaryButton type="button" disabled={saving} onClick={() => void submit({ generateNow: true })}>
              {saving ? "Generating…" : "Generate portfolio"}
            </PrimaryButton>
            <button
              type="button"
              className={SECONDARY_BTN_CLASS}
              disabled={saving}
              onClick={() => void submit({ generateNow: false })}
            >
              Save draft only
            </button>
          </div>
        </section>

        <button
          type="button"
          className="text-sm font-medium text-indigo-700 hover:underline"
          onClick={() => setShowDetails((v) => !v)}
        >
          {showDetails ? "Hide detailed brief" : "Add detailed prospect brief (optional)"}
        </button>

        {showDetails ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit({ generateNow: false });
            }}
            className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Contact person" value={form.prospect_contact} onChange={(v) => setField("prospect_contact", v)} />
              <Field label="Location" value={form.location} onChange={(v) => setField("location", v)} placeholder="Nairobi, Kenya" />
              <Field label="Email" value={form.prospect_email} onChange={(v) => setField("prospect_email", v)} />
              <Field label="Phone" value={form.prospect_phone} onChange={(v) => setField("prospect_phone", v)} />
              <Field label="Business size" value={form.business_size} onChange={(v) => setField("business_size", v)} placeholder="e.g. 2 branches, 8 staff" />
              <Field label="Portfolio title (optional)" value={form.title} onChange={(v) => setField("title", v)} />
              <Field label="Branches" value={form.branch_count} onChange={(v) => setField("branch_count", v)} type="number" />
              <Field label="Tills / outlets" value={form.till_count} onChange={(v) => setField("till_count", v)} type="number" />
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Pain points / goals</span>
              <textarea
                rows={3}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                value={form.pain_points}
                onChange={(e) => setField("pain_points", e.target.value)}
                placeholder="What is hard today? What do they want Centrix to fix?"
              />
            </label>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Focus modules</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(meta?.modules || {}).map(([id, label]) => {
                  const on = (form.focus_modules || []).includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleModule(id)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        on
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <PrimaryButton type="submit" disabled={saving}>
                {saving ? "Saving…" : "Create draft & open editor"}
              </PrimaryButton>
              <button
                type="button"
                className={SECONDARY_BTN_CLASS}
                onClick={() => router.push("/platform/marketing")}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </CatalogPageShell>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <input
        type={type}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function TemplateSwatch({ template }) {
  const colors = template === "editorial"
    ? ["#173B3F", "#A66B42", "#F6F4EF"]
    : template === "bold"
      ? ["#382274", "#E86A33", "#F4F1FA"]
      : ["#185FA5", "#16A085", "#F3F7FA"];

  return (
    <span className="flex h-16 overflow-hidden rounded-lg" aria-hidden="true">
      <span className="w-1/3" style={{ background: colors[0] }} />
      <span className="flex flex-1 flex-col justify-center gap-1 p-2" style={{ background: colors[2] }}>
        <span className="h-1 w-2/3 rounded" style={{ background: colors[0] }} />
        <span className="h-1 w-full rounded bg-slate-300" />
        <span className="h-1 w-4/5 rounded bg-slate-200" />
        <span className="mt-1 h-2 w-1/2 rounded" style={{ background: colors[1] }} />
      </span>
    </span>
  );
}
