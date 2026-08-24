"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  CatalogPageShell,
  FILTER_CONTROL_CLASS,
  FilterToolbar,
  PaginationBar,
  SearchableSelect,
  StatCard,
} from "@/components/catalog/catalog-shared";
import { PlatformAiTrainingNav } from "@/components/platform/platform-ai-training-nav";
import {
  UsageDonutChart,
  UsageRankChart,
  UsageTrendChart,
  formatCount,
  formatUsd,
} from "@/components/platform/platform-ai-usage-charts";
import { CHART_COLORS } from "@/components/reports/report-charts";
import { defaultDateRange, formatAppDateTime } from "@/lib/datetime";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  AI_TRAINING_WORKSPACES,
  aiTrainingApiBase,
  trainAiFromUsageQuestion,
} from "@/lib/platform-ai-training";

const PROVIDER_OPTIONS = [
  { value: "", label: "All providers" },
  { value: "gemini", label: "Gemini" },
  { value: "openai", label: "OpenAI" },
];

function workspaceLabel(id) {
  return AI_TRAINING_WORKSPACES.find((w) => w.id === id)?.label ?? id;
}

function statusTone(status) {
  const s = String(status ?? "").toLowerCase();
  if (s === "ok" || s === "success") return "bg-emerald-50 text-emerald-800";
  if (s === "error") return "bg-red-50 text-red-700";
  return "bg-slate-100 text-slate-600";
}

export function PlatformAiUsageScreen() {
  const apiBase = aiTrainingApiBase();
  const defaults = useMemo(() => defaultDateRange(30), []);
  const [fromDate, setFromDate] = useState(defaults.from);
  const [toDate, setToDate] = useState(defaults.to);
  const [organizationId, setOrganizationId] = useState("");
  const [userId, setUserId] = useState("");
  const [provider, setProvider] = useState("");
  const [organizations, setOrganizations] = useState([]);
  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState([]);
  const [eventsMeta, setEventsMeta] = useState({ current_page: 1, last_page: 1, per_page: 25, total: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [trainingKey, setTrainingKey] = useState(null);
  const [draftReview, setDraftReview] = useState(null);
  const [savingDraft, setSavingDraft] = useState(false);

  const filterParams = useMemo(
    () => ({
      from: fromDate,
      to: toDate,
      organization_id: organizationId || undefined,
      user_id: userId || undefined,
      provider: provider || undefined,
    }),
    [fromDate, toDate, organizationId, userId, provider],
  );

  const orgOptions = useMemo(
    () => [
      { value: "", label: "All organizations" },
      ...organizations.map((org) => ({
        value: String(org.id),
        label: `${org.org_name ?? "Organization"} (${org.company_code ?? org.id})`,
      })),
    ],
    [organizations],
  );

  const userOptions = useMemo(() => {
    const options = [{ value: "", label: "All users" }];
    for (const row of summary?.by_user ?? []) {
      if (!row.user_id) continue;
      options.push({
        value: String(row.user_id),
        label: `${row.user_name}${row.organization_name ? ` · ${row.organization_name}` : ""}`,
      });
    }
    if (userId && !options.some((o) => o.value === String(userId))) {
      options.push({ value: String(userId), label: `User #${userId}` });
    }
    return options;
  }, [summary?.by_user, userId]);

  const loadOrganizations = useCallback(async () => {
    try {
      const res = await apiRequest("/admin/organizations");
      setOrganizations(res.data ?? []);
    } catch {
      setOrganizations([]);
    }
  }, []);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`${apiBase}/usage`, { searchParams: filterParams });
      setSummary(res);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to load AI usage.");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [apiBase, filterParams]);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const res = await apiRequest(`${apiBase}/usage/events`, {
        searchParams: { ...filterParams, page, per_page: pageSize },
      });
      setEvents(res.data ?? []);
      setEventsMeta(res.meta ?? { current_page: 1, last_page: 1, per_page: pageSize, total: 0 });
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to load recent AI events.");
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, [apiBase, filterParams, page, pageSize]);

  useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    setPage(1);
  }, [fromDate, toDate, organizationId, userId, provider]);

  const kpis = summary?.summary ?? {};
  const commonQuestions = summary?.common_questions ?? [];

  async function analyzeAndTrain(row) {
    const key = row.fingerprint || row.question;
    setTrainingKey(key);
    setDraftReview(null);
    try {
      const res = await trainAiFromUsageQuestion({
        question: row.question,
        examples: row.examples ?? [],
        count: row.count,
        workspace_id: row.suggested_workspace_id || null,
        save: false,
      });
      setDraftReview({
        sourceQuestion: row.question,
        draft: {
          topic: res.draft?.topic ?? row.question,
          content: res.draft?.content ?? "",
          path: res.draft?.path ?? "",
          workspace_id: res.draft?.workspace_id ?? row.suggested_workspace_id ?? "",
        },
      });
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not draft a training note.");
    } finally {
      setTrainingKey(null);
    }
  }

  async function saveDraftNote() {
    if (!draftReview?.draft?.topic || !draftReview?.draft?.content) return;
    setSavingDraft(true);
    try {
      await apiRequest(`${apiBase}/knowledge`, {
        method: "POST",
        body: {
          topic: draftReview.draft.topic.trim(),
          content: draftReview.draft.content.trim(),
          path: draftReview.draft.path?.trim() || null,
          workspace_id: draftReview.draft.workspace_id || null,
        },
      });
      notifySuccess("Training note saved — applies to all tenants, including hospitality.");
      setDraftReview(null);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to save training note.");
    } finally {
      setSavingDraft(false);
    }
  }

  return (
    <CatalogPageShell
      title="AI usage"
      subtitle="Track assistant requests across retail and hospitality tenants, then train from the most common questions."
      action={
        <button
          type="button"
          onClick={() => {
            loadSummary();
            loadEvents();
          }}
          className="rounded-lg border px-3 py-1.5 text-sm theme-heading hover:bg-slate-50"
        >
          Refresh
        </button>
      }
    >
      <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "AI usage" }]} />
      <PlatformAiTrainingNav />

      <FilterToolbar className="mb-5">
        <label className="flex flex-col gap-1 text-xs theme-subtext">
          From
          <input type="date" className={FILTER_CONTROL_CLASS} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs theme-subtext">
          To
          <input type="date" className={FILTER_CONTROL_CLASS} value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>
        <label className="flex min-w-[14rem] flex-col gap-1 text-xs theme-subtext">
          Organization
          <SearchableSelect value={organizationId} onChange={setOrganizationId} options={orgOptions} className={FILTER_CONTROL_CLASS} />
        </label>
        <label className="flex min-w-[14rem] flex-col gap-1 text-xs theme-subtext">
          User
          <SearchableSelect value={userId} onChange={setUserId} options={userOptions} className={FILTER_CONTROL_CLASS} />
        </label>
        <label className="flex min-w-[10rem] flex-col gap-1 text-xs theme-subtext">
          Provider
          <SearchableSelect value={provider} onChange={setProvider} options={PROVIDER_OPTIONS} className={FILTER_CONTROL_CLASS} />
        </label>
      </FilterToolbar>

      {loading && !summary ? <p className="text-sm theme-subtext">Loading usage…</p> : null}

      {!loading && summary && !summary.available ? (
        <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm theme-subtext">
          {summary.message || "AI usage metrics are not available yet."}
        </p>
      ) : null}

      {summary?.available ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Requests" value={formatCount(kpis.requests)} hint={`${formatCount(kpis.error_count)} errors`} />
            <StatCard
              label="Tokens"
              value={formatCount(kpis.total_tokens)}
              hint={`${formatCount(kpis.input_tokens)} in · ${formatCount(kpis.output_tokens)} out`}
            />
            <StatCard
              label={`Est. cost (${summary.cost_currency ?? "USD"})`}
              value={formatUsd(kpis.estimated_cost)}
              hint="Approximate provider list price"
            />
            <StatCard
              label="Active tenants"
              value={formatCount(kpis.active_organizations)}
              hint={`${formatCount(kpis.active_users)} users · avg ${kpis.avg_latency_ms ?? "—"} ms`}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <UsageTrendChart points={summary.by_day ?? []} loading={loading} />
            </div>
            <UsageDonutChart
              title="By provider"
              segments={(summary.by_provider ?? []).map((row, i) => ({
                label: row.provider,
                value: row.requests,
                color: CHART_COLORS[i % CHART_COLORS.length],
              }))}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <UsageRankChart title="By organization" rows={summary.by_organization} labelKey="organization_name" valueKey="requests" />
            <UsageRankChart title="By user" rows={summary.by_user} labelKey="user_name" valueKey="requests" />
            <UsageRankChart
              title="Tokens by model"
              rows={(summary.by_model ?? []).map((row) => ({ ...row, label: `${row.provider}/${row.model}` }))}
              labelKey="label"
              valueKey="total_tokens"
            />
            <UsageRankChart
              title="Estimated cost by org"
              rows={summary.by_organization}
              labelKey="organization_name"
              valueKey="estimated_cost"
              valueFormat="usd"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="theme-panel overflow-hidden rounded-xl border shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="text-sm font-semibold theme-heading">Organizations</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Organization</th>
                      <th className="px-4 py-3">Requests</th>
                      <th className="px-4 py-3">Tokens</th>
                      <th className="px-4 py-3">Users</th>
                      <th className="px-4 py-3">Cost</th>
                      <th className="px-4 py-3">Errors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(summary.by_organization ?? []).length ? (
                      summary.by_organization.map((row) => (
                        <tr key={row.organization_id}>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              className="text-left font-medium text-[#185FA5] hover:underline"
                              onClick={() => setOrganizationId(String(row.organization_id))}
                            >
                              {row.organization_name}
                            </button>
                            {row.company_code ? <p className="font-mono text-[11px] text-slate-500">{row.company_code}</p> : null}
                          </td>
                          <td className="px-4 py-3 tabular-nums">{formatCount(row.requests)}</td>
                          <td className="px-4 py-3 tabular-nums">{formatCount(row.total_tokens)}</td>
                          <td className="px-4 py-3 tabular-nums">{formatCount(row.unique_users)}</td>
                          <td className="px-4 py-3 tabular-nums">{formatUsd(row.estimated_cost)}</td>
                          <td className="px-4 py-3 tabular-nums">{formatCount(row.error_count)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                          No organization usage in this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="theme-panel overflow-hidden rounded-xl border shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="text-sm font-semibold theme-heading">Users</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Organization</th>
                      <th className="px-4 py-3">Requests</th>
                      <th className="px-4 py-3">Tokens</th>
                      <th className="px-4 py-3">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(summary.by_user ?? []).length ? (
                      summary.by_user.map((row) => (
                        <tr key={`${row.user_id}-${row.organization_id}`}>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              className="text-left font-medium text-[#185FA5] hover:underline"
                              onClick={() => {
                                if (row.user_id) setUserId(String(row.user_id));
                                if (row.organization_id) setOrganizationId(String(row.organization_id));
                              }}
                            >
                              {row.user_name}
                            </button>
                            {row.username ? <p className="font-mono text-[11px] text-slate-500">{row.username}</p> : null}
                          </td>
                          <td className="px-4 py-3 text-slate-700">{row.organization_name ?? "—"}</td>
                          <td className="px-4 py-3 tabular-nums">{formatCount(row.requests)}</td>
                          <td className="px-4 py-3 tabular-nums">{formatCount(row.total_tokens)}</td>
                          <td className="px-4 py-3 tabular-nums">{formatUsd(row.estimated_cost)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                          No user usage in this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="theme-panel rounded-xl border p-4 shadow-sm">
              <h3 className="text-sm font-semibold theme-heading">Top tools</h3>
              <ul className="mt-3 space-y-1.5 text-sm">
                {(summary.top_tools ?? []).length ? (
                  summary.top_tools.map((row) => (
                    <li key={row.tool} className="flex justify-between gap-3">
                      <span className="font-mono text-xs theme-heading">{row.tool}</span>
                      <span className="theme-subtext">{formatCount(row.count)}</span>
                    </li>
                  ))
                ) : (
                  <li className="theme-subtext">No tool calls yet.</li>
                )}
              </ul>
            </section>
            <section className="theme-panel rounded-xl border p-4 shadow-sm">
              <h3 className="text-sm font-semibold theme-heading">Error codes</h3>
              <ul className="mt-3 space-y-1.5 text-sm">
                {(summary.error_codes ?? []).length ? (
                  summary.error_codes.map((row) => (
                    <li key={row.error_code} className="flex justify-between gap-3">
                      <span className="font-mono text-xs text-red-700">{row.error_code}</span>
                      <span className="theme-subtext">{formatCount(row.requests)}</span>
                    </li>
                  ))
                ) : (
                  <li className="theme-subtext">No errors in this period.</li>
                )}
              </ul>
            </section>
          </div>

          <section className="theme-panel overflow-hidden rounded-xl border shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold theme-heading">Most common questions</h3>
                <p className="text-xs theme-subtext">
                  Clustered from real prompts — analyze with AI and save platform training notes (works for hospitality too).
                </p>
              </div>
              <Link href="/platform/ai-training" className="text-xs font-medium text-[#185FA5] hover:underline">
                Open training notes
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Question</th>
                    <th className="px-4 py-3">Asks</th>
                    <th className="px-4 py-3">Orgs</th>
                    <th className="px-4 py-3">Module</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {commonQuestions.length ? (
                    commonQuestions.map((row) => {
                      const key = row.fingerprint || row.question;
                      const busy = trainingKey === key;
                      return (
                        <tr key={key} className="align-top">
                          <td className="max-w-[28rem] px-4 py-3 text-slate-700">
                            <p className="line-clamp-2">{row.question}</p>
                            {(row.examples ?? []).length > 1 ? (
                              <p className="mt-1 text-[11px] text-slate-400">
                                +{(row.examples.length - 1).toLocaleString()} similar phrasing
                                {row.examples.length - 1 === 1 ? "" : "s"}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 tabular-nums">{formatCount(row.count)}</td>
                          <td className="px-4 py-3 tabular-nums">{formatCount(row.organization_count)}</td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {row.suggested_workspace_id ? workspaceLabel(row.suggested_workspace_id) : "All modules"}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              disabled={Boolean(trainingKey)}
                              onClick={() => analyzeAndTrain(row)}
                              className="rounded-lg bg-[#185FA5] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#134d88] disabled:opacity-50"
                            >
                              {busy ? "Analyzing…" : "Train with AI"}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        No prompt text logged in this period yet. Once users chat, common questions appear here.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {draftReview ? (
              <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-4">
                <h4 className="text-sm font-semibold theme-heading">Review training note</h4>
                <p className="mt-1 text-xs theme-subtext">From: {draftReview.sourceQuestion}</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="block text-xs theme-subtext">
                    Topic
                    <input
                      className={`${FILTER_CONTROL_CLASS} mt-1 w-full`}
                      value={draftReview.draft.topic}
                      onChange={(e) =>
                        setDraftReview((prev) =>
                          prev ? { ...prev, draft: { ...prev.draft, topic: e.target.value } } : prev,
                        )
                      }
                    />
                  </label>
                  <label className="block text-xs theme-subtext">
                    Path
                    <input
                      className={`${FILTER_CONTROL_CLASS} mt-1 w-full`}
                      value={draftReview.draft.path}
                      onChange={(e) =>
                        setDraftReview((prev) =>
                          prev ? { ...prev, draft: { ...prev.draft, path: e.target.value } } : prev,
                        )
                      }
                      placeholder="/hospitality/front-desk"
                    />
                  </label>
                  <label className="block text-xs theme-subtext md:col-span-2">
                    Content
                    <textarea
                      className={`${FILTER_CONTROL_CLASS} mt-1 min-h-[7rem] w-full`}
                      value={draftReview.draft.content}
                      onChange={(e) =>
                        setDraftReview((prev) =>
                          prev ? { ...prev, draft: { ...prev.draft, content: e.target.value } } : prev,
                        )
                      }
                    />
                  </label>
                  <label className="block text-xs theme-subtext">
                    Module scope
                    <select
                      className={`${FILTER_CONTROL_CLASS} mt-1 w-full`}
                      value={draftReview.draft.workspace_id || ""}
                      onChange={(e) =>
                        setDraftReview((prev) =>
                          prev ? { ...prev, draft: { ...prev.draft, workspace_id: e.target.value } } : prev,
                        )
                      }
                    >
                      <option value="">All modules</option>
                      {AI_TRAINING_WORKSPACES.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={savingDraft}
                    onClick={saveDraftNote}
                    className="rounded-lg bg-[#185FA5] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#134d88] disabled:opacity-50"
                  >
                    {savingDraft ? "Saving…" : "Save training note"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftReview(null)}
                    className="rounded-lg border px-3 py-1.5 text-xs theme-heading hover:bg-white"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="theme-panel overflow-hidden rounded-xl border shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold theme-heading">Recent activity</h3>
                <p className="text-xs theme-subtext">Latest assistant calls with org, user, model, and tokens</p>
              </div>
              <Link href="/platform/ai-training" className="text-xs font-medium text-[#185FA5] hover:underline">
                Open AI training
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3">Organization</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Model</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Tokens</th>
                    <th className="px-4 py-3">Cost</th>
                    <th className="px-4 py-3">Latency</th>
                    <th className="px-4 py-3">Prompt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {eventsLoading && events.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                        Loading events…
                      </td>
                    </tr>
                  ) : events.length ? (
                    events.map((row) => (
                      <tr key={row.id} className="align-top">
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatAppDateTime(row.created_at)}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">{row.organization_name ?? "—"}</p>
                          {row.company_code ? <p className="font-mono text-[11px] text-slate-500">{row.company_code}</p> : null}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">{row.user_name ?? "—"}</p>
                          {row.username ? <p className="font-mono text-[11px] text-slate-500">{row.username}</p> : null}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-mono text-xs text-slate-700">{row.provider}</p>
                          <p className="font-mono text-[11px] text-slate-500">{row.model ?? "—"}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone(row.status)}`}>
                            {row.status}
                          </span>
                          {row.error_code ? <p className="mt-1 font-mono text-[11px] text-red-600">{row.error_code}</p> : null}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate-700">{formatCount(row.total_tokens)}</td>
                        <td className="px-4 py-3 tabular-nums text-slate-700">{formatUsd(row.estimated_cost)}</td>
                        <td className="px-4 py-3 tabular-nums text-slate-700">
                          {row.latency_ms != null ? `${row.latency_ms} ms` : "—"}
                        </td>
                        <td className="max-w-[220px] px-4 py-3 text-xs text-slate-600" title={row.prompt_preview ?? ""}>
                          <p className="line-clamp-2">{row.prompt_preview || "—"}</p>
                          {(row.tools_used ?? []).length ? (
                            <p className="mt-1 font-mono text-[10px] text-slate-400">{row.tools_used.join(", ")}</p>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                        No recent AI activity for these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {(eventsMeta.total ?? 0) > 0 ? (
              <PaginationBar
                page={eventsMeta.current_page ?? page}
                totalPages={eventsMeta.last_page ?? 1}
                total={eventsMeta.total ?? 0}
                pageSize={eventsMeta.per_page ?? pageSize}
                onChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            ) : null}
          </section>
        </div>
      ) : null}
    </CatalogPageShell>
  );
}
