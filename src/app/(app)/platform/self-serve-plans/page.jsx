"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell, PrimaryButton, SearchableSelect } from "@/components/catalog/catalog-shared";
import { formatBillingMoney } from "@/lib/platform-billing";
import { INDUSTRIES, industryById } from "@/lib/erp-industries";
import { useConfirm } from "@/lib/use-confirm";
import { initialPackageAccess, ManagedFreePlanCard, modulesForPlan, monthOffer, onceOffer, OneTimeQuoteCard, PaymentSimulation, PlanAccessFields, PlanGroup, prepaidOffer, TokenPackCard, YearlyBillingSwitch } from "@/components/platform/upgrade-plan-cards";

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
    yearly_billing: yearly
      ? (plan.yearly_billing === "subscription" ? "subscription" : "one_time")
      : null,
    currency: plan.currency || "KES",
    monthly_price: plan.monthly_price,
    yearly_price: plan.yearly_price,
    renewal_price: plan.renewal_price,
    seat_limit: plan.seat_limit,
    trial_days: plan.trial_days,
    features,
    feature_details: Array.isArray(plan.feature_details) ? plan.feature_details : [],
    industry: plan.industry || "commerce",
    workspace_keys: Array.isArray(plan.workspace_keys) ? plan.workspace_keys : [],
    feature_keys: plan.feature_keys && typeof plan.feature_keys === "object" ? plan.feature_keys : null,
    section_keys: Array.isArray(plan.section_keys) ? plan.section_keys : [],
    is_active: plan.is_active !== false,
    is_recommended: Boolean(plan.is_recommended),
    cta_action: plan.cta_action || "buy_now",
    cta_label: plan.cta_label ?? "",
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
    yearly_billing: "one_time",
    price: "",
    renewal_price: "",
    seat_limit: "1",
    trial_days: "14",
    feature_details: [{ label: "", detail: "" }],
    workspace_keys: [],
    feature_keys: {},
    section_keys: [],
    is_active: true,
    is_recommended: false,
    cta_action: "buy_now",
    cta_label: "",
  };
}

function recordToForm(plan, catalog) {
  const access = modulesForPlan(catalog, plan);
  const selected = initialPackageAccess(plan, access);
  const features = Array.isArray(plan.feature_details) && plan.feature_details.length > 0
    ? plan.feature_details.map((row) => ({ label: row?.label ?? "", detail: row?.detail ?? "" }))
    : [{ label: "", detail: "" }];
  const yearly = plan.interval === "annual" || plan.interval === "yearly";
  return {
    name: plan.name ?? "",
    description: plan.description ?? "",
    industry: plan.industry || "commerce",
    interval: yearly ? "yearly" : "monthly",
    yearly_billing: plan.yearly_billing === "subscription" ? "subscription" : "one_time",
    price: yearly
      ? (plan.yearly_price != null ? String(plan.yearly_price) : "")
      : (plan.monthly_price != null ? String(plan.monthly_price) : ""),
    renewal_price: plan.renewal_price != null ? String(plan.renewal_price) : "",
    seat_limit: plan.seat_limit != null ? String(plan.seat_limit) : "1",
    trial_days: plan.trial_days != null ? String(plan.trial_days) : "14",
    feature_details: features,
    workspace_keys: selected.workspace_keys,
    feature_keys: selected.feature_keys,
    section_keys: Array.isArray(plan.section_keys) ? [...plan.section_keys] : [],
    is_active: plan.is_active !== false,
    is_recommended: Boolean(plan.is_recommended),
    cta_action: plan.cta_action || "buy_now",
    cta_label: plan.cta_label ?? "",
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
  const yearlyBilling = yearly
    ? (form.yearly_billing === "subscription" ? "subscription" : "one_time")
    : null;
  const renewal =
    yearly && yearlyBilling === "one_time" && form.renewal_price !== "" && form.renewal_price != null
      ? Number(form.renewal_price)
      : amount;
  const seats = Math.max(1, Number(form.seat_limit) || 1);
  const trialDays = Math.max(1, Math.min(365, Number(form.trial_days) || 14));
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    industry: form.industry || "commerce",
    interval: yearly ? "annual" : "monthly",
    yearly_billing: yearlyBilling,
    license_basis: "org",
    currency: "KES",
    price: amount,
    first_payment_price: amount,
    renewal_price: Number.isFinite(renewal) && renewal > 0 ? renewal : amount,
    monthly_price: yearly ? null : amount,
    yearly_price: yearly ? amount : null,
    seat_limit: seats,
    trial_days: trialDays,
    workspace_keys: form.workspace_keys ?? [],
    feature_keys: form.feature_keys && typeof form.feature_keys === "object" ? form.feature_keys : {},
    section_keys: form.industry === "commerce" ? (form.section_keys ?? []) : [],
    feature_details: (form.feature_details ?? [])
      .map((row) => ({
        label: String(row?.label ?? "").trim(),
        detail: String(row?.detail ?? "").trim() || null,
      }))
      .filter((row) => row.label !== ""),
    self_serve: true,
    is_active: form.is_active !== false,
    is_recommended: Boolean(form.is_recommended),
    cta_action: form.cta_action || "buy_now",
    cta_label: String(form.cta_label ?? "").trim() || null,
  };
}

function PlanPreview({ industryFilter, plans, discount, yearly = false, setYearly, ordering, onMove, manage, loading, policy, freePlan = null }) {
  const published = byCardOrder(
    plans.filter((plan) => (plan.industry || "commerce") === industryFilter),
  ).map((plan) => previewPlan(plan, discount));
  const monthlyPlans = published.filter((plan) => plan.interval !== "yearly" && Number(plan.monthly_price) > 0);
  const yearlyPlans = published.filter((plan) => plan.interval === "yearly" && Number(plan.yearly_price) > 0);
  const monthly = monthlyPlans.map(monthOffer);
  const prepaid = monthlyPlans.map((plan) => prepaidOffer(plan, discount));
  const once = yearlyPlans.filter((plan) => plan.yearly_billing !== "subscription").map(onceOffer);
  const yearSubs = yearlyPlans.filter((plan) => plan.yearly_billing === "subscription").map((plan) => ({
    ...onceOffer(plan),
    kind: "year_sub",
  }));
  const offers = yearly ? [...prepaid, ...yearSubs, ...once] : monthly;
  const quoteCard = <OneTimeQuoteCard preview />;
  const tokenPackOn = policy?.tokens_enabled !== false && Number(policy?.token_pack_price_kes) > 0;
  const tokenCard = tokenPackOn ? (
    <TokenPackCard
      preview
      tokens={Number(policy?.token_pack_tokens) || 0}
      price={Number(policy?.token_pack_price_kes) || 0}
      saleTokens={Number(policy?.sale_tokens) || 1}
    />
  ) : null;

  return (
    <section className="rounded-xl border border-slate-200 bg-[var(--theme-page-bg,#f3f6f9)] px-4 py-6 sm:px-6">
      <h2 className="text-sm font-semibold text-slate-900">Plan cards</h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        Free sits first, then the paid packages. Use the Yearly switch to preview a whole year on those packages. Name the free plan, choose its modules, tick Recommended on a paid card, then save.
      </p>
      <YearlyBillingSwitch yearly={yearly} onChange={setYearly} />
      {loading && plans.length === 0 ? (
        <p className="mt-8 text-sm text-slate-500">Loading plans…</p>
      ) : (
        <div className="mt-8">
          <PlanGroup
            leading={freePlan}
            offers={offers}
            preview
            moving={ordering}
            onMove={onMove}
            manage={manage}
            trailing={[tokenCard, quoteCard].filter(Boolean)}
          />
          {offers.length === 0 ? (
            <p className="mx-auto mt-6 max-w-lg rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 text-center text-sm text-slate-500">
              {yearly
                ? "No yearly prices are published for this industry yet."
                : "No monthly plans are published for this industry yet."}
            </p>
          ) : null}
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
  const [industryFilter, setIndustryFilter] = useState("commerce");
  const [discount, setDiscount] = useState({ percent: 0, minMonths: 3 });
  const [previewYearly, setPreviewYearly] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [savingCardId, setSavingCardId] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [shortCode, setShortCode] = useState("");
  const [simulation, setSimulation] = useState(null);
  const [tokenBusy, setTokenBusy] = useState(false);
  const [freePlan, setFreePlan] = useState(null);
  const [freeBusy, setFreeBusy] = useState(false);
  const [packageCatalog, setPackageCatalog] = useState({});
  const [aiComposeOpen, setAiComposeOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/platform-plans");
      const rows = Array.isArray(res.data) ? res.data : [];
      setPlans(rows.filter((plan) => plan.self_serve));
      setPackageCatalog(res.catalog && typeof res.catalog === "object" ? res.catalog : {});
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not load self-serve plans.");
    } finally {
      setLoading(false);
    }
    try {
      const [settings, policyRes] = await Promise.all([
        apiRequest("/admin/platform-paybill"),
        apiRequest("/admin/billing-policy"),
      ]);
      setDiscount({
        percent: Number(settings.data?.duration_discount_percent) || 0,
        minMonths: Number(settings.data?.duration_discount_min_months ?? 3),
      });
      setShortCode(String(settings.data?.short_code ?? ""));
      setPolicy(policyRes.data ?? null);
      setFreePlan(settings.data?.free_plan_access && typeof settings.data.free_plan_access === "object" ? settings.data.free_plan_access : null);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not load platform payment settings.");
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
      setAiComposeOpen(false);
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
    setForm(recordToForm(plan, packageCatalog));
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

  async function saveCard(preview, draft) {
    const source = plans.find((plan) => plan.id === preview.id);
    const amount = Number(draft.price);
    if (!source) return;
    if (!String(draft.name ?? "").trim()) {
      notifyError("Enter a plan name.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      notifyError("Enter a price greater than 0.");
      return;
    }
    setSavingCardId(source.id);
    try {
      const payload = formToPayload({
        ...recordToForm(source),
        name: draft.name,
        description: draft.description,
        price: String(amount),
        renewal_price: draft.renewal_price ?? "",
        seat_limit: draft.seat_limit ?? "1",
        trial_days: draft.trial_days ?? "14",
        yearly_billing: draft.yearly_billing === "subscription" ? "subscription" : "one_time",
        feature_details: draft.features,
        is_active: draft.is_active,
        is_recommended: Boolean(draft.is_recommended),
        cta_action: draft.cta_action || source.cta_action || "buy_now",
        cta_label: String(draft.cta_label ?? "").trim() || null,
        workspace_keys: draft.workspace_keys,
        feature_keys: draft.feature_keys,
        section_keys: draft.section_keys,
      });
      await apiRequest(`/admin/platform-plans/${source.id}`, { method: "PATCH", body: payload });
      notifySuccess("Card saved.");
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save this card.");
    } finally {
      setSavingCardId(null);
    }
  }

  async function toggleTokens() {
    if (!policy || tokenBusy) return;
    const enabled = policy.tokens_enabled === false;
    const next = { ...policy, tokens_enabled: enabled };
    setTokenBusy(true);
    setPolicy(next);
    try {
      const res = await apiRequest("/admin/billing-policy", { method: "PUT", body: next });
      setPolicy(res.data ?? next);
      notifySuccess(enabled ? "Token subscriptions are on." : "Token subscriptions are off.");
    } catch (err) {
      setPolicy(policy);
      notifyError(err instanceof ApiError ? err.message : "Could not update token billing.");
    } finally {
      setTokenBusy(false);
    }
  }

  async function toggleUnpaidLogin(enabled) {
    if (!policy || freeBusy) return;
    const next = { ...policy, allow_unpaid_login: enabled };
    setFreeBusy(true);
    setPolicy(next);
    try {
      const res = await apiRequest("/admin/billing-policy", { method: "PUT", body: next });
      setPolicy(res.data ?? next);
      notifySuccess(
        enabled
          ? "Organisations without a trial or paid plan can sign in on Package 1."
          : "Organisations without a trial or paid plan cannot sign in until they pay.",
      );
    } catch (err) {
      setPolicy(policy);
      notifyError(err instanceof ApiError ? err.message : "Could not update unpaid sign-in.");
    } finally {
      setFreeBusy(false);
    }
  }

  function setFreeAccess(industry, access) {
    setFreePlan((current) => {
      const base = current && typeof current === "object" ? current : {};
      return {
        ...base,
        [industry]: {
          ...(base[industry] ?? {}),
          workspace_keys: access.workspace_keys ?? [],
          feature_keys: access.feature_keys ?? {},
        },
      };
    });
  }

  function setFreePlanName(nextName) {
    setFreePlan((current) => {
      const base = current && typeof current === "object" ? current : {};
      return { ...base, name: nextName };
    });
  }

  async function saveFreePlan() {
    if (!freePlan || freeBusy) return;
    const label = String(freePlan.name ?? "").trim() || "Package 1";
    setFreeBusy(true);
    try {
      const res = await apiRequest("/admin/platform-paybill", {
        method: "PUT",
        body: { free_plan_access: { ...freePlan, name: label } },
      });
      if (res.data?.free_plan_access) setFreePlan(res.data.free_plan_access);
      notifySuccess(`${label} saved.`);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save the free plan.");
    } finally {
      setFreeBusy(false);
    }
  }

  function previewTokenPayment() {
    if (!policy) return;
    setSimulation({
      kind: "token",
      amount: Number(policy.token_pack_price_kes) || 0,
      currency: "KES",
      tokens: Number(policy.token_pack_tokens) || 0,
      saleTokens: Number(policy.sale_tokens) || 1,
      plan: {
        name: "Token pack",
        description: "Pay for tokens instead of a calendar plan.",
        features: [
          `${Number(policy.token_pack_tokens) || 0} tokens added`,
          `Each completed sale uses ${Number(policy.sale_tokens) || 1} token${Number(policy.sale_tokens) === 1 ? "" : "s"}`,
          "Reading stays free",
        ],
      },
    });
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="edit-ai-plan-title">
        <form onSubmit={(event) => void handleRevise(event)} className="theme-modal my-8 w-full max-w-2xl rounded-xl border p-5 shadow-2xl">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="edit-ai-plan-title" className="text-sm font-semibold text-slate-900">Edit {aiEdit.plan?.name || "plan"}</h2>
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
        </div>
      ) : null}

      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium"
            onClick={() => {
              setComposeIndustry(industryFilter);
              setAiComposeOpen(true);
            }}
          >
            Create with Centrix AI
          </button>
          <PrimaryButton
            type="button"
            showIcon={false}
            onClick={() => {
              setEditingId(null);
              setForm({ ...emptyForm(), industry: industryFilter });
              setFormOpen(true);
            }}
          >
            New plan
          </PrimaryButton>
        </div>
      </div>

      <div className="theme-panel mb-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">Token-based subscription</p>
          <p className="mt-1 max-w-xl text-sm text-slate-600">
            When this is on, an organisation can buy a token pack as well as Package 1. Turn it off and the token pack card disappears. Package 1 stays.
          </p>
        </div>
        <div className="flex items-center gap-3">
                      <button
                        type="button"
            role="switch"
            aria-checked={policy?.tokens_enabled !== false}
            disabled={!policy || tokenBusy}
            onClick={() => void toggleTokens()}
            className={`rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60 ${
              policy?.tokens_enabled !== false ? "theme-primary-btn" : "theme-secondary-btn"
            }`}
          >
            {policy?.tokens_enabled !== false ? "On" : "Off"}
                      </button>
          <button
            type="button"
            className="text-sm font-medium text-[#185FA5] disabled:text-slate-400"
            disabled={!policy || policy.tokens_enabled === false}
            onClick={previewTokenPayment}
          >
            Preview token payment
                      </button>
        </div>
          </div>

      <PlanPreview
        industryFilter={industryFilter}
        plans={plans}
        discount={discount}
        yearly={previewYearly}
        setYearly={setPreviewYearly}
        ordering={ordering}
        onMove={moveOffers}
        manage={{ onSave: saveCard, onRemove: handleDelete, savingId: savingCardId, onPreview: setSimulation, catalog: packageCatalog }}
        loading={loading}
        policy={policy}
        freePlan={(
          <ManagedFreePlanCard
            modules={modulesForPlan(packageCatalog, { industry: industryFilter })}
            access={freePlan?.[industryFilter] ?? { workspace_keys: [], feature_keys: {} }}
            name={freePlan?.name || "Package 1"}
            onNameChange={setFreePlanName}
            industries={[]}
            industry={industryFilter}
            busy={freeBusy}
            onChange={(access) => setFreeAccess(industryFilter, access)}
            onSave={freePlan ? () => void saveFreePlan() : undefined}
            allowUnpaidLogin={policy?.allow_unpaid_login !== false}
            unpaidLoginBusy={freeBusy || !policy}
            onUnpaidLoginChange={(enabled) => void toggleUnpaidLogin(enabled)}
          />
        )}
      />
      </div>

      {aiComposeOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="create-ai-plan-title">
          <form onSubmit={(event) => void handleCompose(event)} className="theme-modal my-8 w-full max-w-2xl rounded-xl border p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="create-ai-plan-title" className="text-sm font-semibold text-slate-900">Create with Centrix AI</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Describe the plan and price. Centrix AI drafts the card points and applications for the selected industry.
                </p>
              </div>
              <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={() => setAiComposeOpen(false)}>
                Close
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
                <input className={inputClass} type="number" min={MIN_PLAN_POINTS} max={MAX_PLAN_POINTS} step={1} value={points} onChange={(e) => setPoints(e.target.value)} />
                <span className="mt-1 block text-xs text-slate-500">Minimum {MIN_PLAN_POINTS}; maximum {MAX_PLAN_POINTS}.</span>
              </label>
            </div>
            <textarea
              className={`${inputClass} mt-3 min-h-40`}
              value={words}
              onChange={(e) => setWords(e.target.value)}
              placeholder={"Shop\n\nTill and products — Sell at the counter, with prices, tax, and a receipt.\nStock on hand — See what is left and receive goods from suppliers.\nDaily sales — Customers, today's takings, and a simple sales report.\n\nat 2000 Ksh"}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm" onClick={() => setAiComposeOpen(false)}>
                Cancel
              </button>
              <PrimaryButton type="submit" showIcon={false} disabled={drafting}>
                {drafting ? "Creating…" : "Create plan"}
              </PrimaryButton>
            </div>
          </form>
        </div>
      ) : null}

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
              <label className="block text-sm sm:max-w-xs">
                <span className="mb-1 block text-xs font-medium text-slate-600">Website button</span>
                <SearchableSelect
                  value={form.cta_action}
                  nativeEvent
                  onChange={(e) => setForm((f) => ({ ...f, cta_action: e.target.value }))}
                  options={[
                    { value: 'buy_now', label: 'Pay Now' },
                    { value: 'start_now', label: 'Subscribe Now' },
                    { value: 'view_details', label: 'View details' },
                    { value: 'contact_sales', label: 'Contact sales' },
                  ]}
                  placeholder="Choose button"
                />
              </label>
              <label className="block text-sm sm:max-w-md">
                <span className="mb-1 block text-xs font-medium text-slate-600">Custom button text (optional)</span>
                <input
                  className={inputClass}
                  maxLength={48}
                  value={form.cta_label}
                  onChange={(e) => setForm((f) => ({ ...f, cta_label: e.target.value }))}
                  placeholder="Pay Now or Subscribe Now"
                />
                <span className="mt-1 block text-xs text-slate-500">
                  Overrides the selected website button label on this plan card.
                </span>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Industry</span>
                <SearchableSelect
                  value={form.industry}
                  onChange={(industry) => {
                    if (!industry) return;
                    const access = initialPackageAccess(
                      { industry, workspace_keys: [], feature_keys: null },
                      modulesForPlan(packageCatalog, { industry }),
                    );
                    setForm((f) => ({
                      ...f,
                      industry,
                      workspace_keys: access.workspace_keys,
                      feature_keys: access.feature_keys,
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

              {form.interval === "yearly" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-medium text-slate-600">Yearly billing</span>
                    <SearchableSelect
                      value={form.yearly_billing}
                      nativeEvent
                      onChange={(e) => setForm((f) => ({ ...f, yearly_billing: e.target.value }))}
                      options={[
                        { value: "one_time", label: "One-time payment" },
                        { value: "subscription", label: "Yearly subscription" },
                      ]}
                      placeholder="One-time or subscription"
                    />
                    <span className="mt-1 block text-xs text-slate-500">
                      Subscription renews at the yearly price. One-time uses an agreed renewal amount.
                    </span>
                  </label>
                  {form.yearly_billing === "one_time" ? (
                    <label className="block text-sm">
                      <span className="mb-1 block text-xs font-medium text-slate-600">Agreed renewal (KES)</span>
                      <input
                        className={inputClass}
                        inputMode="decimal"
                        value={form.renewal_price}
                        onChange={(e) => setForm((f) => ({ ...f, renewal_price: e.target.value }))}
                        placeholder={form.price || "Renewal amount"}
                      />
                    </label>
                  ) : (
                    <p className="self-end text-xs text-slate-500 sm:pb-2">
                      The yearly price above is the renewal amount.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500">The monthly price is the renewal amount for subscriptions.</p>
              )}

              <label className="block text-sm sm:max-w-xs">
                <span className="mb-1 block text-xs font-medium text-slate-600">Seats on this package</span>
                <input
                  className={inputClass}
                  inputMode="numeric"
                  min="1"
                  value={form.seat_limit}
                  onChange={(e) => setForm((f) => ({ ...f, seat_limit: e.target.value }))}
                />
                <span className="mt-1 block text-xs text-slate-500">
                  Applied automatically when this package is assigned to an organisation.
                </span>
              </label>

              <label className="block text-sm sm:max-w-xs">
                <span className="mb-1 block text-xs font-medium text-slate-600">Maximum trial days</span>
                <input
                  className={inputClass}
                  inputMode="numeric"
                  min="1"
                  max="365"
                  value={form.trial_days}
                  onChange={(e) => setForm((f) => ({ ...f, trial_days: e.target.value }))}
                />
                <span className="mt-1 block text-xs text-slate-500">
                  Cap when platform admin puts a shop on trial of this package. After the trial ends they move to the free plan.
                </span>
              </label>

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

              <PlanAccessFields
                modules={modulesForPlan(packageCatalog, form)}
                workspaceKeys={form.workspace_keys}
                featureKeys={form.feature_keys}
                onChange={(access) => setForm((current) => ({ ...current, ...access }))}
              />

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_active !== false}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                Published on the subscription screen
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(form.is_recommended)}
                  onChange={(e) => setForm((f) => ({ ...f, is_recommended: e.target.checked }))}
                />
                Recommended on the subscription screen
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
      {simulation ? (
        <PaymentSimulation
          key={`${simulation.kind}-${simulation.plan?.name}-${simulation.amount}`}
          snapshot={simulation}
          shortCode={shortCode}
          onClose={() => setSimulation(null)}
        />
      ) : null}
    </CatalogPageShell>
  );
}
