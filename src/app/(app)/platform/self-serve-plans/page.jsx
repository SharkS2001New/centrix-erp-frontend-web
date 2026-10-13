"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell, PrimaryButton, SearchableSelect } from "@/components/catalog/catalog-shared";
import { formatBillingMoney, licensableWorkspacesForIndustry } from "@/lib/platform-billing";
import { BACKOFFICE_SECTION_CATALOG } from "@/lib/backoffice-sections";
import { INDUSTRIES, industryById } from "@/lib/erp-industries";
import { useConfirm } from "@/lib/use-confirm";
import { monthOffer, onceOffer, PlanGroup, prepaidOffer } from "@/components/platform/upgrade-plan-cards";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]";

const industryOptions = INDUSTRIES.map((item) => ({ value: item.id, label: item.label }));
const MIN_PLAN_POINTS = 8;
const MAX_PLAN_POINTS = 20;

function byCardOrder(rows) {
  return [...rows].sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.name ?? "").localeCompare(String(b.name ?? "")));
}

function previewPlan(plan, discount) {
  const yearly = plan.interval === "annual" || plan.interval === "yearly";
  const features = (Array.isArray(plan.feature_details) ? plan.feature_details : []).map((row) => {
    const label = String(row?.label ?? "").trim();
    if (!label) return "";
    const detail = String(row?.detail ?? "").trim();
    return detail ? `${label}: ${detail}` : label;
  }).filter(Boolean);
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    interval: yearly ? "yearly" : "monthly",
    currency: plan.currency || "KES",
    monthly_price: plan.monthly_price,
    yearly_price: plan.yearly_price,
    features,
    discount_percent: discount.percent,
    discount_min_months: discount.minMonths,
  };
}

function planPointCount(plan) {
  const written = Array.isArray(plan?.feature_details) ? plan.feature_details.filter((row) => String(row?.label ?? "").trim()).length : 0;
  return String(Math.min(MAX_PLAN_POINTS, Math.max(MIN_PLAN_POINTS, written || MIN_PLAN_POINTS)));
}

function planToBrief(plan) {
  const yearly = plan?.interval === "annual" || plan?.interval === "yearly";
  const raw = yearly ? plan?.yearly_price : plan?.monthly_price;
  const amount = raw == null || raw === "" ? "" : String(raw).replace(/\.00$/, "");
  const lines = [];
  const industry = industryById(plan?.industry || "commerce")?.label;
  if (industry) lines.push(industry);
  if (plan?.name) lines.push(plan.name);
  if (plan?.description) lines.push(plan.description);
  lines.push("");
  for (const row of plan?.feature_details ?? []) {
    const label = String(row?.label ?? "").trim();
    if (!label) continue;
    const detail = String(row?.detail ?? "").trim();
    lines.push(detail ? `${label} — ${detail}` : label);
  }
  lines.push("");
  if (amount) lines.push(`at ${amount} Ksh${yearly ? " a year" : ""}`);
  return lines.join("\n").trim();
}

function emptyForm() {
  return {
    name: "",
    description: "",
    industry: "commerce",
    interval: "monthly",
    price: "",
    feature_details: [{ label: "", detail: "" }],
    workspace_keys: [],
    section_keys: [],
    is_active: true,
  };
}

function recordToForm(plan) {
  const features = Array.isArray(plan.feature_details) && plan.feature_details.length > 0
    ? plan.feature_details.map((row) => ({ label: row?.label ?? "", detail: row?.detail ?? "" }))
    : [{ label: "", detail: "" }];
  const yearly = plan.interval === "annual" || plan.interval === "yearly";
  return {
    name: plan.name ?? "",
    description: plan.description ?? "",
    industry: plan.industry || "commerce",
    interval: yearly ? "yearly" : "monthly",
    price: yearly
      ? (plan.yearly_price != null ? String(plan.yearly_price) : "")
      : (plan.monthly_price != null ? String(plan.monthly_price) : ""),
    feature_details: features,
    workspace_keys: Array.isArray(plan.workspace_keys) ? [...plan.workspace_keys] : [],
    section_keys: Array.isArray(plan.section_keys) ? [...plan.section_keys] : [],
    is_active: plan.is_active !== false,
  };
}

function PlanContents({ title, items }) {
  const rows = Array.isArray(items) ? items.filter(Boolean) : [];
  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-slate-500">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">None</p>
      ) : (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-800">
          {rows.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formToPayload(form) {
  const amount = Number(form.price);
  const yearly = form.interval === "yearly";
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    industry: form.industry || "commerce",
    interval: yearly ? "annual" : "monthly",
    license_basis: "org",
    currency: "KES",
    price: amount,
    first_payment_price: amount,
    renewal_price: amount,
    monthly_price: yearly ? null : amount,
    yearly_price: yearly ? amount : null,
    workspace_keys: (form.workspace_keys ?? []).filter((id) =>
      licensableWorkspacesForIndustry(form.industry || "commerce").some((ws) => ws.id === id),
    ),
    section_keys: form.industry === "commerce" ? (form.section_keys ?? []) : [],
    feature_details: (form.feature_details ?? [])
      .map((row) => ({
        label: String(row?.label ?? "").trim(),
        detail: String(row?.detail ?? "").trim() || null,
      }))
      .filter((row) => row.label !== ""),
    self_serve: true,
    is_active: form.is_active !== false,
  };
}

function PlanPreview({ industryFilter, plans, discount, billing, setBilling, ordering, onMove }) {
  if (industryFilter === "all") {
    return (
      <p className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">
        Choose an industry to see the cards an organisation sees, and to change their order.
      </p>
    );
  }

  const published = byCardOrder(
    plans.filter((plan) => plan.is_active !== false && (plan.industry || "commerce") === industryFilter),
  ).map((plan) => previewPlan(plan, discount));
  const monthlyPlans = published.filter((plan) => plan.interval !== "yearly" && Number(plan.monthly_price) > 0);
  const yearlyPlans = published.filter((plan) => plan.interval === "yearly" && Number(plan.yearly_price) > 0);
  const monthly = monthlyPlans.map(monthOffer);
  const prepaid = monthlyPlans.map((plan) => prepaidOffer(plan, discount));
  const once = yearlyPlans.map(onceOffer);
  const saving = prepaid.some((offer) => offer.percent > 0);
  const tabs = ["monthly", "yearly"];

  return (
    <section className="rounded-xl border border-slate-200 bg-[var(--theme-page-bg,#f3f6f9)] px-4 py-6 sm:px-6">
      <h2 className="text-sm font-semibold text-slate-900">How organisations see these cards</h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        Published plans only. The third card is marked Recommended. Move a card and the organisation screen uses that order. The 12-month cards are the monthly plans, so moving one there also moves it on Monthly. Hidden plans stay in the list below. The token pack is set with Centrix Paybill.
      </p>
      <div className="mx-auto mt-5 flex w-fit rounded-full border border-[var(--theme-border)] bg-[var(--theme-surface-subtle)] p-1 text-sm">
        {tabs.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setBilling(option)}
            className={`rounded-full px-5 py-1.5 font-medium ${
              billing === option
                ? "bg-[var(--theme-surface)] text-[var(--theme-text)] shadow-sm"
                : "text-[var(--theme-text-muted)]"
            }`}
          >
            {option === "yearly" ? "Yearly" : "Monthly"}
          </button>
        ))}
      </div>
      {billing === "yearly" ? (
        prepaid.length + once.length === 0 ? (
          <p className="mx-auto mt-8 max-w-lg rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 text-center text-sm text-slate-500">
            No yearly prices are published for this industry yet.
          </p>
        ) : (
          <div className="mt-8 space-y-10">
            {prepaid.length > 0 ? (
              <PlanGroup
                title="12 months of a monthly plan"
                hint={saving ? "The monthly price for a year, with the duration discount taken off." : "The monthly price, paid now for the whole year."}
                offers={prepaid}
                preview
                moving={ordering}
                onMove={onMove}
              />
            ) : null}
            {once.length > 0 ? (
              <PlanGroup
                title="Pay once for the year"
                hint="A yearly price set for the plan. One payment, not twelve monthly charges."
                offers={once}
                preview
                moving={ordering}
                onMove={onMove}
              />
            ) : null}
          </div>
        )
      ) : monthly.length === 0 ? (
        <p className="mx-auto mt-8 max-w-lg rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 text-center text-sm text-slate-500">
          No monthly plans are published for this industry yet.
        </p>
      ) : (
        <div className="mt-8">
          <PlanGroup offers={monthly} preview moving={ordering} onMove={onMove} />
        </div>
      )}
    </section>
  );
}

export default function SelfServePlansPage() {
  const confirm = useConfirm();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [words, setWords] = useState("");
  const [composeIndustry, setComposeIndustry] = useState("commerce");
  const [points, setPoints] = useState(String(MIN_PLAN_POINTS));
  const [drafting, setDrafting] = useState(false);
  const [aiEdit, setAiEdit] = useState(null);
  const [revising, setRevising] = useState(false);
  const [created, setCreated] = useState(null);
  const [industryFilter, setIndustryFilter] = useState("all");
  const [discount, setDiscount] = useState({ percent: 0, minMonths: 3 });
  const [previewBilling, setPreviewBilling] = useState("monthly");
  const [ordering, setOrdering] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/platform-plans");
      const rows = Array.isArray(res.data) ? res.data : [];
      setPlans(rows.filter((plan) => plan.self_serve));
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not load self-serve plans.");
    } finally {
      setLoading(false);
    }
    try {
      const settings = await apiRequest("/admin/platform-paybill");
      setDiscount({
        percent: Number(settings.data?.duration_discount_percent) || 0,
        minMonths: Number(settings.data?.duration_discount_min_months ?? 3),
      });
    } catch {
      setDiscount({ percent: 0, minMonths: 3 });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function moveOffers(offers, index, direction) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= offers.length || ordering) return;
    const next = [...offers];
    const [moved] = next.splice(index, 1);
    next.splice(nextIndex, 0, moved);
    const order = new Map(next.map((offer, position) => [offer.plan.id, position + 1]));
    setPlans((current) => current.map((plan) => (order.has(plan.id) ? { ...plan, sort_order: order.get(plan.id) } : plan)));
    setOrdering(true);
    try {
      await apiRequest("/admin/platform-plans/reorder", {
        method: "POST",
        body: { ids: next.map((offer) => offer.plan.id) },
      });
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save the card order.");
      await load();
    } finally {
      setOrdering(false);
    }
  }

  function toggleKey(field, key) {
    setForm((prev) => {
      const set = new Set(prev[field] ?? []);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return { ...prev, [field]: [...set] };
    });
  }

  async function handleSave(event) {
    event.preventDefault();
    const amount = Number(form.price);
    if (!form.name.trim()) {
      notifyError("Enter a plan name.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      notifyError(form.interval === "yearly" ? "Enter a yearly price greater than 0." : "Enter a monthly price greater than 0.");
      return;
    }
    setSaving(true);
    try {
      const payload = formToPayload(form);
      if (editingId) {
        await apiRequest(`/admin/platform-plans/${editingId}`, { method: "PATCH", body: payload });
        notifySuccess("Plan updated. Organisations see it on Choose a plan.");
      } else {
        await apiRequest("/admin/platform-plans", { method: "POST", body: payload });
        notifySuccess("Plan published. Organisations can choose it on Choose a plan.");
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save this plan.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCompose(event) {
    event.preventDefault();
    const count = Number(points);
    if (!Number.isInteger(count) || count < MIN_PLAN_POINTS || count > MAX_PLAN_POINTS) {
      notifyError(`Card points start at ${MIN_PLAN_POINTS} and cannot be more than ${MAX_PLAN_POINTS}.`);
      return;
    }
    if (!words.trim()) {
      notifyError("Write what this plan includes, and include the price in KES.");
      return;
    }
    setDrafting(true);
    try {
      const res = await apiRequest("/admin/platform-plans/compose", {
        method: "POST",
        body: { description: words.trim(), industry: composeIndustry || "commerce", points: count },
      });
      setCreated({ summary: res.summary ?? null, plan: res.data ?? null });
      notifySuccess(res.message || "Centrix AI created this plan.");
      setWords("");
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Centrix AI could not create this plan.");
    } finally {
      setDrafting(false);
    }
  }

  function openAiEdit(plan) {
    setAiEdit({
      id: plan.id,
      plan,
      industry: plan.industry || "commerce",
      points: planPointCount(plan),
      text: planToBrief(plan),
    });
    if (plan.industry) setIndustryFilter(plan.industry);
  }

  function openFieldEdit(plan) {
    setEditingId(plan.id);
    setForm(recordToForm(plan));
    setFormOpen(true);
  }

  async function handleRevise(event) {
    event.preventDefault();
    if (!aiEdit) return;
    const count = Number(aiEdit.points);
    if (!Number.isInteger(count) || count < MIN_PLAN_POINTS || count > MAX_PLAN_POINTS) {
      notifyError(`Card points start at ${MIN_PLAN_POINTS} and cannot be more than ${MAX_PLAN_POINTS}.`);
      return;
    }
    if (aiEdit.text.trim().length < 8) {
      notifyError("Say what should change, or edit the plan text.");
      return;
    }
    setRevising(true);
    try {
      const res = await apiRequest(`/admin/platform-plans/${aiEdit.id}/compose`, {
        method: "POST",
        body: {
          description: aiEdit.text.trim(),
          industry: aiEdit.industry || "commerce",
          points: count,
        },
      });
      setCreated({ summary: res.summary ?? null, plan: res.data ?? null });
      notifySuccess(res.message || "Centrix AI updated this plan.");
      setAiEdit(null);
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Centrix AI could not update this plan.");
    } finally {
      setRevising(false);
    }
  }

  async function handleDelete(plan) {
    const ok = await confirm({
      title: "Remove this plan?",
      message: `“${plan.name}” will no longer appear on the subscription screen. An organisation already on it keeps that licence until it ends.`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/admin/platform-plans/${plan.id}`, { method: "DELETE" });
      notifySuccess("Plan removed.");
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not remove this plan.");
    }
  }

  return (
    <CatalogPageShell
      title="Self-serve plans"
      subtitle="Write what the plan includes and the price in KES. A short line is enough. Choose how many card points to create, at least 8."
    >
      <div className="flex min-h-[calc(100dvh-11rem)] flex-col md:min-h-[calc(100dvh-12rem)] lg:min-h-[calc(100dvh-13rem)]">
      <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "Self-serve plans" }]} />

      <form onSubmit={(event) => void handleCompose(event)} className="theme-panel mb-4 shrink-0 rounded-xl border p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Create with Centrix AI</h2>
        <p className="mt-1 text-sm text-slate-500">
          Choose the industry and how many card points to create. Then write what the plan includes and the price in KES. A short line such as “Small shop, 2000 a month” is enough. Centrix AI writes the card points and fills in the applications.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Industry</span>
            <SearchableSelect
              value={composeIndustry}
              onChange={(industry) => {
                if (!industry) return;
                setComposeIndustry(industry);
                setIndustryFilter(industry);
              }}
              options={industryOptions}
              placeholder="Select industry"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Card points</span>
            <input
              className={inputClass}
              type="number"
              min={MIN_PLAN_POINTS}
              max={MAX_PLAN_POINTS}
              step={1}
              value={points}
              onChange={(e) => setPoints(e.target.value)}
            />
            <span className="mt-1 block text-xs text-slate-500">Minimum {MIN_PLAN_POINTS}. Centrix AI creates this many lines on the plan card.</span>
          </label>
        </div>
        <textarea
          className={`${inputClass} mt-3 min-h-28`}
          value={words}
          onChange={(e) => setWords(e.target.value)}
          placeholder={"Shop\n\nTill and products — Sell at the counter, with prices, tax, and a receipt.\nStock on hand — See what is left and receive goods from suppliers.\nDaily sales — Customers, today's takings, and a simple sales report.\n\nat 2000 Ksh"}
        />
        <div className="mt-3 flex justify-end">
          <PrimaryButton type="submit" showIcon={false} disabled={drafting}>
            {drafting ? "Creating…" : "Create plan"}
          </PrimaryButton>
        </div>
      </form>

      {created?.summary ? (
        <div className="theme-panel mb-4 shrink-0 rounded-xl border p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">This plan includes</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">{created.summary.name}</h2>
          {created.summary.description ? (
            <p className="mt-1 text-sm text-slate-600">{created.summary.description}</p>
          ) : null}
          <p className="mt-2 text-sm font-medium text-slate-900">
            {industryById(created.summary.industry || created.plan?.industry || "commerce")?.label ?? "Retail & Distribution"}
            {" · "}
            {created.summary.interval} · {formatBillingMoney(created.summary.price, created.summary.currency || "KES")}
          </p>
          <PlanContents title="On the card" items={created.summary.features} />
          <PlanContents title="Applications" items={created.summary.workspaces} />
          <PlanContents title="Backoffice sections" items={created.summary.sections} />
          {created.plan ? (
            <button
              type="button"
              className="mt-4 text-sm font-medium text-[#185FA5]"
              onClick={() => openAiEdit(created.plan)}
            >
              Edit this plan
            </button>
          ) : null}
        </div>
      ) : null}

      {aiEdit ? (
        <form onSubmit={(event) => void handleRevise(event)} className="theme-panel mb-4 shrink-0 rounded-xl border p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Edit {aiEdit.plan?.name || "plan"}</h2>
              <p className="mt-1 text-sm text-slate-500">
                Change the plan text, or write what should change. Centrix AI updates this package and writes the number of card points you set.
              </p>
            </div>
            <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={() => setAiEdit(null)}>
              Close
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Industry</span>
              <SearchableSelect
                value={aiEdit.industry}
                onChange={(industry) => {
                  if (!industry) return;
                  setAiEdit((current) => (current ? { ...current, industry } : current));
                  setIndustryFilter(industry);
                }}
                options={industryOptions}
                placeholder="Select industry"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Card points</span>
              <input
                className={inputClass}
                type="number"
                min={MIN_PLAN_POINTS}
                max={MAX_PLAN_POINTS}
                step={1}
                value={aiEdit.points}
                onChange={(e) => setAiEdit((current) => (current ? { ...current, points: e.target.value } : current))}
              />
              <span className="mt-1 block text-xs text-slate-500">Minimum {MIN_PLAN_POINTS}.</span>
            </label>
          </div>
          <textarea
            className={`${inputClass} mt-3 min-h-40`}
            value={aiEdit.text}
            onChange={(e) => setAiEdit((current) => (current ? { ...current, text: e.target.value } : current))}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <button type="button" className="text-sm font-medium text-[#185FA5]" onClick={() => openFieldEdit(aiEdit.plan)}>
              Edit fields
            </button>
            <PrimaryButton type="submit" showIcon={false} disabled={revising}>
              {revising ? "Updating…" : "Update with Centrix AI"}
            </PrimaryButton>
          </div>
        </form>
      ) : null}

      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-medium ${industryFilter === "all" ? "bg-[#185FA5] text-white" : "bg-slate-100 text-slate-700"}`}
            onClick={() => setIndustryFilter("all")}
          >
            All industries
          </button>
          {INDUSTRIES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-medium ${industryFilter === item.id ? "bg-[#185FA5] text-white" : "bg-slate-100 text-slate-700"}`}
              onClick={() => {
              setIndustryFilter(item.id);
              setComposeIndustry(item.id);
            }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <PrimaryButton
          type="button"
          showIcon={false}
          onClick={() => {
            setEditingId(null);
            setForm({ ...emptyForm(), industry: industryFilter === "all" ? composeIndustry : industryFilter });
            setFormOpen(true);
          }}
        >
          New plan
        </PrimaryButton>
      </div>

      <PlanPreview
        industryFilter={industryFilter}
        plans={plans}
        discount={discount}
        billing={previewBilling}
        setBilling={setPreviewBilling}
        ordering={ordering}
        onMove={moveOffers}
      />

      <div className="theme-panel mt-4 flex min-h-80 flex-1 flex-col rounded-xl border shadow-sm">
        {loading ? (
          <p className="px-5 py-8 text-sm text-slate-500">Loading plans…</p>
        ) : plans.filter((plan) => industryFilter === "all" || (plan.industry || "commerce") === industryFilter).length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500">
            {plans.length === 0
              ? "No self-serve plans yet. Create one, for example a 2,000 plan with a few sections and a 3,000 plan with more."
              : "No packages for this industry yet. Set a price and publish one."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Plan</th>
                  <th className="px-5 py-3">Industry</th>
                  <th className="px-5 py-3">Billing</th>
                  <th className="px-5 py-3">Price</th>
                  <th className="px-5 py-3">Features</th>
                  <th className="px-5 py-3">On the subscribe screen</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byCardOrder(plans.filter((plan) => industryFilter === "all" || (plan.industry || "commerce") === industryFilter)).map((plan) => (
                  <tr key={plan.id}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{plan.name}</p>
                      {plan.description ? <p className="text-xs text-slate-500">{plan.description}</p> : null}
                    </td>
                    <td className="px-5 py-3">{industryById(plan.industry || "commerce")?.label ?? "Retail & Distribution"}</td>
                    <td className="px-5 py-3">{plan.interval === "annual" || plan.interval === "yearly" ? "Yearly" : "Monthly"}</td>
                    <td className="px-5 py-3 tabular-nums">
                      {formatBillingMoney(
                        plan.interval === "annual" || plan.interval === "yearly" ? plan.yearly_price : plan.monthly_price,
                        plan.currency || "KES",
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{plan.feature_details?.length ?? 0}</td>
                    <td className="px-5 py-3">
                      {plan.is_active ? (
                        <span className="text-emerald-700">Published</span>
                      ) : (
                        <span className="text-slate-500">Hidden</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        className="mr-3 text-sm font-medium text-[#185FA5]"
                        onClick={() => openAiEdit(plan)}
                      >
                        Edit
                      </button>
                      <button type="button" className="text-sm text-red-700" onClick={() => void handleDelete(plan)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>

      {formOpen ? (
        <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/40 p-4">
          <form onSubmit={(event) => void handleSave(event)} className="mx-auto my-8 max-w-3xl rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">{editingId ? "Edit plan" : "New self-serve plan"}</h2>
            <div className="mt-4 space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Name</span>
                <input className={inputClass} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Sales essentials" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Short description</span>
                <input className={inputClass} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Sales, customers, and the reports that belong to them" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Industry</span>
                <SearchableSelect
                  value={form.industry}
                  onChange={(industry) => {
                    if (!industry) return;
                    const allowed = new Set(licensableWorkspacesForIndustry(industry).map((ws) => ws.id));
                    setForm((f) => ({
                      ...f,
                      industry,
                      workspace_keys: (f.workspace_keys ?? []).filter((id) => allowed.has(id)),
                      section_keys: industry === "commerce" ? f.section_keys : [],
                    }));
                  }}
                  options={industryOptions}
                  placeholder="Select industry"
                />
                <span className="mt-1 block text-xs text-slate-500">This package and its price are only offered to organisations in this industry.</span>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Shows on</span>
                  <SearchableSelect
                    value={form.interval}
                    nativeEvent
                    onChange={(e) => setForm((f) => ({ ...f, interval: e.target.value }))}
                    options={[
                      { value: "monthly", label: "Monthly" },
                      { value: "yearly", label: "Yearly" },
                    ]}
                    placeholder="Monthly or yearly"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">{form.interval === "yearly" ? "Yearly price (KES)" : "Monthly price (KES)"}</span>
                  <input className={inputClass} inputMode="decimal" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder={form.interval === "yearly" ? "15000" : "2000"} />
                </label>
              </div>

              <div>
                <p className="mb-1 text-xs font-medium text-slate-600">What the organisation reads on the card</p>
                <div className="space-y-2">
                  {form.feature_details.map((row, index) => (
                    <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
                      <input
                        className={inputClass}
                        value={row.label}
                        placeholder="Sales & orders"
                        onChange={(e) =>
                          setForm((f) => {
                            const next = [...f.feature_details];
                            next[index] = { ...next[index], label: e.target.value };
                            return { ...f, feature_details: next };
                          })
                        }
                      />
                      <input
                        className={inputClass}
                        value={row.detail}
                        placeholder="Orders, invoices, and their reports"
                        onChange={(e) =>
                          setForm((f) => {
                            const next = [...f.feature_details];
                            next[index] = { ...next[index], detail: e.target.value };
                            return { ...f, feature_details: next };
                          })
                        }
                      />
                      <button
                        type="button"
                        className="rounded-lg px-2 text-sm text-slate-500 hover:bg-slate-100"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            feature_details: f.feature_details.filter((_, i) => i !== index),
                          }))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-2 text-sm font-medium text-[#185FA5]"
                  onClick={() => setForm((f) => ({ ...f, feature_details: [...f.feature_details, { label: "", detail: "" }] }))}
                >
                  Add a feature
                </button>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium text-slate-600">Applications this plan opens</p>
                <ul className="space-y-1 rounded-lg border border-slate-200 p-2">
                  {licensableWorkspacesForIndustry(form.industry).map((ws) => (
                    <li key={ws.id}>
                      <label className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={form.workspace_keys.includes(ws.id)}
                          onChange={() => toggleKey("workspace_keys", ws.id)}
                        />
                        <span>
                          <span className="font-medium">{ws.label}</span>
                          <span className="mt-0.5 block text-xs text-slate-500">{ws.description}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>

              {form.industry === "commerce" ? <div>
                <p className="mb-1 text-xs font-medium text-slate-600">Backoffice sections this plan turns on</p>
                <p className="mb-2 text-xs text-slate-500">
                  Checked sections are the only Backoffice areas this plan opens, including their reports.
                </p>
                <ul className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {BACKOFFICE_SECTION_CATALOG.map((section) => (
                    <li key={section.key}>
                      <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={form.section_keys.includes(section.key)}
                          onChange={() => toggleKey("section_keys", section.key)}
                        />
                        {section.label}
                      </label>
                    </li>
                  ))}
                </ul>
              </div> : null}

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_active !== false}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                Published on the subscription screen
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100" onClick={() => setFormOpen(false)}>
                Cancel
              </button>
              <PrimaryButton type="submit" showIcon={false} disabled={saving}>
                {saving ? "Saving…" : "Save plan"}
              </PrimaryButton>
            </div>
          </form>
        </div>
      ) : null}
    </CatalogPageShell>
  );
}
