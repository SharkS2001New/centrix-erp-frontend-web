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
  pain_points: "",
  focus_modules: [],
  title: "",
};

export default function NewMarketingPortfolioPage() {
  const router = useRouter();
  const [meta, setMeta] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

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

  async function onSubmit(e) {
    e.preventDefault();
    if (!form.prospect_name.trim()) {
      notifyError("Prospect name is required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        title: form.title.trim() || undefined,
        branch_count: form.branch_count === "" ? null : Number(form.branch_count),
        till_count: form.till_count === "" ? null : Number(form.till_count),
        industry: vertical?.industry || "commerce",
        hero_image_key: vertical?.hero_image_key || undefined,
      };
      const res = await createMarketingPortfolio(payload);
      const id = res.data?.id;
      notifySuccess("Portfolio created.");
      router.push(id ? `/platform/marketing/${id}` : "/platform/marketing");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not create portfolio.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CatalogPageShell
      breadcrumb={
        <AdminBreadcrumb
          items={[
            { label: "Platform", href: "/platform" },
            { label: "Marketing portfolios", href: "/platform/marketing" },
            { label: "New" },
          ]}
        />
      }
      title="New marketing portfolio"
      description="Fill the prospect brief. AI will turn it into a professional Centrix portfolio."
    >
      <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Prospect name *" value={form.prospect_name} onChange={(v) => setField("prospect_name", v)} />
          <Field label="Business name" value={form.business_name} onChange={(v) => setField("business_name", v)} />
          <Field label="Contact person" value={form.prospect_contact} onChange={(v) => setField("prospect_contact", v)} />
          <Field label="Location" value={form.location} onChange={(v) => setField("location", v)} placeholder="Nairobi, Kenya" />
          <Field label="Email" value={form.prospect_email} onChange={(v) => setField("prospect_email", v)} />
          <Field label="Phone" value={form.prospect_phone} onChange={(v) => setField("prospect_phone", v)} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Vertical</span>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
              value={form.vertical}
              onChange={(e) => {
                const id = e.target.value;
                const v = meta?.verticals?.find((row) => row.id === id);
                setForm((prev) => ({
                  ...prev,
                  vertical: id,
                  focus_modules: v?.default_modules || prev.focus_modules,
                  pain_points:
                    prev.pain_points?.trim()
                      ? prev.pain_points
                      : (v?.pain_hints || []).join("; "),
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
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
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
          <Field label="Business size" value={form.business_size} onChange={(v) => setField("business_size", v)} placeholder="e.g. 2 branches, 8 staff" />
          <Field label="Portfolio title (optional)" value={form.title} onChange={(v) => setField("title", v)} />
          <Field label="Branches" value={form.branch_count} onChange={(v) => setField("branch_count", v)} type="number" />
          <Field label="Tills / outlets" value={form.till_count} onChange={(v) => setField("till_count", v)} type="number" />
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Pain points / goals</span>
          <textarea
            rows={4}
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
            {saving ? "Creating…" : "Create & open editor"}
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
    </CatalogPageShell>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <input
        type={type}
        className="w-full rounded-lg border border-slate-200 px-3 py-2"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
