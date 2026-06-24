"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell, PrimaryButton } from "@/components/catalog/catalog-shared";
import { AiActionForm, buildInitialFormValues } from "@/components/ai/ai-action-form";
import { aiStartersForWorkspace } from "@/lib/ai-workspace";
import {
  AI_TRAINING_WORKSPACE_OPTIONS,
  AI_TRAINING_WORKSPACES,
  aiTrainingApiBase,
  aiTrainingWorkspacePath,
} from "@/lib/platform-ai-training";
import { PLATFORM_COMPANY_CODE } from "@/lib/admin-scope";
import {
  PlatformAiTrainingAlerts,
  PlatformAiTrainingNav,
} from "@/components/platform/platform-ai-training-nav";

const PREVIEW_ORG_STORAGE_KEY = "platform-ai-training-preview-org-id";

const TRAINING_TABS = [
  { id: "knowledge", label: "Knowledge" },
  { id: "test", label: "Test console" },
];

function workspaceLabel(id) {
  return AI_TRAINING_WORKSPACES.find((w) => w.id === id)?.label ?? id;
}

function PlatformAiTrainingTabs({ activeTab, onChange }) {
  return (
    <div className="mb-6 flex flex-wrap gap-2 border-b border-[var(--theme-border)] pb-3">
      {TRAINING_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            activeTab === tab.id
              ? "bg-indigo-600 text-white"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function PlatformAiTrainingScreen() {
  const apiBase = aiTrainingApiBase();
  const [activeTab, setActiveTab] = useState("knowledge");

  const [knowledge, setKnowledge] = useState([]);
  const [filterWorkspace, setFilterWorkspace] = useState("");
  const [status, setStatus] = useState(null);
  const [loadingKnowledge, setLoadingKnowledge] = useState(false);
  const [savingKnowledge, setSavingKnowledge] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState({
    id: null,
    topic: "",
    content: "",
    path: "",
    workspace_id: "",
  });

  const [organizations, setOrganizations] = useState([]);
  const [previewOrgId, setPreviewOrgId] = useState("");
  const [testWorkspace, setTestWorkspace] = useState("backoffice");
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [formSpec, setFormSpec] = useState(null);
  const [formValues, setFormValues] = useState({});
  const bottomRef = useRef(null);

  const tenantOrgs = useMemo(
    () =>
      organizations.filter(
        (org) => String(org.company_code ?? "").toUpperCase() !== PLATFORM_COMPANY_CODE,
      ),
    [organizations],
  );

  const previewOrg = useMemo(
    () => tenantOrgs.find((org) => String(org.id) === String(previewOrgId)) ?? null,
    [tenantOrgs, previewOrgId],
  );

  const starters = useMemo(() => aiStartersForWorkspace(testWorkspace), [testWorkspace]);
  const noteCount = status?.knowledge_count ?? knowledge.length;

  const loadStatus = useCallback(async () => {
    try {
      const query =
        activeTab === "test" && previewOrgId
          ? `?preview_organization_id=${encodeURIComponent(previewOrgId)}`
          : "";
      const res = await apiRequest(`${apiBase}/status${query}`);
      setStatus(res);
    } catch {
      setStatus(null);
    }
  }, [apiBase, activeTab, previewOrgId]);

  const loadKnowledge = useCallback(async () => {
    setLoadingKnowledge(true);
    setError(null);
    try {
      const query = filterWorkspace ? `?workspace_id=${encodeURIComponent(filterWorkspace)}` : "";
      const res = await apiRequest(`${apiBase}/knowledge${query}`);
      setKnowledge(res.data ?? []);
    } catch (e) {
      setKnowledge([]);
      setError(e instanceof ApiError ? e.message : "Failed to load training notes.");
    } finally {
      setLoadingKnowledge(false);
    }
  }, [apiBase, filterWorkspace]);

  const loadOrganizations = useCallback(async () => {
    setLoadingOrgs(true);
    try {
      const res = await apiRequest("/admin/organizations");
      const rows = res.data ?? [];
      setOrganizations(rows);
      const stored = typeof window !== "undefined" ? window.sessionStorage.getItem(PREVIEW_ORG_STORAGE_KEY) : null;
      const initial =
        stored && rows.some((org) => String(org.id) === stored)
          ? stored
          : String(rows.find((org) => String(org.company_code ?? "").toUpperCase() !== PLATFORM_COMPANY_CODE)?.id ?? "");
      setPreviewOrgId(initial);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load organizations.");
    } finally {
      setLoadingOrgs(false);
    }
  }, []);

  useEffect(() => {
    loadKnowledge();
    loadOrganizations();
  }, [loadKnowledge, loadOrganizations]);

  useEffect(() => {
    loadKnowledge();
  }, [filterWorkspace, loadKnowledge]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (previewOrgId) {
      window.sessionStorage.setItem(PREVIEW_ORG_STORAGE_KEY, previewOrgId);
    }
    if (activeTab === "test") {
      loadStatus();
      setMessages([]);
      setPendingAction(null);
      setFormSpec(null);
      setFormValues({});
    }
  }, [previewOrgId, activeTab, loadStatus]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingAction, formSpec]);

  function resetKnowledgeForm() {
    setForm({ id: null, topic: "", content: "", path: "", workspace_id: "" });
  }

  function editEntry(entry) {
    setForm({
      id: entry.id,
      topic: entry.topic ?? "",
      content: entry.content ?? "",
      path: entry.path ?? "",
      workspace_id: entry.workspace_id ?? "",
    });
    setMessage(null);
    setError(null);
  }

  async function saveKnowledge(e) {
    e.preventDefault();
    if (!form.topic.trim() || !form.content.trim()) return;
    setSavingKnowledge(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        topic: form.topic.trim(),
        content: form.content.trim(),
        path: form.path.trim() || null,
        workspace_id: form.workspace_id || null,
      };
      if (form.id) {
        await apiRequest(`${apiBase}/knowledge/${form.id}`, { method: "PATCH", body: payload });
        setMessage("Platform training note updated — applies to all tenants.");
      } else {
        await apiRequest(`${apiBase}/knowledge`, { method: "POST", body: payload });
        setMessage("Platform training note saved — applies to all tenants.");
      }
      resetKnowledgeForm();
      await loadKnowledge();
      await loadStatus();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save training note.");
    } finally {
      setSavingKnowledge(false);
    }
  }

  async function deleteEntry(id) {
    if (!window.confirm("Delete this platform training note? It will stop applying to all tenants.")) return;
    setError(null);
    try {
      await apiRequest(`${apiBase}/knowledge/${id}`, { method: "DELETE" });
      if (form.id === id) resetKnowledgeForm();
      await loadKnowledge();
      await loadStatus();
      setMessage("Training note deleted.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete training note.");
    }
  }

  const clearChatState = useCallback(() => {
    setPendingAction(null);
    setFormSpec(null);
    setFormValues({});
  }, []);

  const applyChatResponse = useCallback(
    (res) => {
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
      if (res.pending_action) {
        setPendingAction(res.pending_action);
      } else {
        clearChatState();
      }
      if (res.form_spec?.fields?.length) {
        setFormSpec(res.form_spec);
        setFormValues((prev) => ({
          ...buildInitialFormValues(res.form_spec),
          ...prev,
          ...(res.pending_action?.params ?? {}),
        }));
      } else if (!res.pending_action) {
        setFormSpec(null);
      }
    },
    [clearChatState],
  );

  const sendChat = useCallback(
    async (text, { previewForm = false } = {}) => {
      const messageText = text.trim();
      if (!messageText || !previewOrgId || chatLoading) return;
      setChatError(null);
      setChatLoading(true);
      if (!previewForm) {
        setMessages((prev) => [...prev, { role: "user", content: messageText }]);
      }
      setInput("");
      try {
        const res = await apiRequest(`${apiBase}/chat`, {
          method: "POST",
          body: {
            preview_organization_id: Number(previewOrgId),
            workspace_id: testWorkspace,
            pathname: aiTrainingWorkspacePath(testWorkspace),
            message: messageText,
            history: messages.slice(-10),
            pending_action: pendingAction ?? undefined,
            form_values: previewForm && Object.keys(formValues).length ? formValues : undefined,
            confirm_action: previewForm,
          },
        });
        applyChatResponse(res);
      } catch (err) {
        setChatError(err instanceof ApiError ? err.message : "AI test request failed.");
      } finally {
        setChatLoading(false);
      }
    },
    [apiBase, previewOrgId, chatLoading, messages, pendingAction, formValues, testWorkspace, applyChatResponse],
  );

  function switchTestWorkspace(id) {
    setTestWorkspace(id);
    setMessages([]);
    clearChatState();
    setChatError(null);
  }

  return (
    <CatalogPageShell
      title="AI training"
      subtitle="Platform-wide knowledge and test console for the ERP assistant — shared across every tenant."
    >
      <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "AI training" }]} />

      <PlatformAiTrainingNav />
      <PlatformAiTrainingTabs activeTab={activeTab} onChange={setActiveTab} />
      <PlatformAiTrainingAlerts error={error} message={message} />

      {activeTab === "knowledge" ? (
        <section className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-6 shadow-sm">
          <div className="border-b border-indigo-100 pb-5">
            <h2 className="text-base font-semibold text-indigo-950">Platform-wide knowledge</h2>
            <p className="mt-2 max-w-4xl text-sm text-indigo-900/80">
              Use these notes for how the product works, standard workflows, and consistent terminology — not
              tenant-specific data like customer names or prices.
            </p>
            <p className="mt-2 text-xs text-indigo-800">
              {noteCount} platform note{noteCount === 1 ? "" : "s"} active
            </p>
          </div>

          <div className="mt-6 grid gap-8 xl:grid-cols-2 xl:items-start">
            <div className="theme-panel min-h-0 rounded-xl border bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">
                {form.id ? "Edit training note" : "Add training note"}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Facts every tenant assistant should know. Optionally limit to a module workspace or related screen path.
              </p>

              <form onSubmit={saveKnowledge} className="mt-4 flex min-h-[min(70vh,640px)] flex-col gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Topic</span>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    value={form.topic}
                    onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
                    placeholder="e.g. How GRN works"
                    required
                  />
                </label>
                <label className="block min-h-0 flex-1 text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Content</span>
                  <textarea
                    className="min-h-[min(42vh,360px)] w-full flex-1 rounded-lg border border-slate-300 px-3 py-2"
                    value={form.content}
                    onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                    placeholder="What should every organization's assistant know?"
                    required
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Related path (optional)</span>
                    <input
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                      value={form.path}
                      onChange={(e) => setForm((f) => ({ ...f, path: e.target.value }))}
                      placeholder="/purchases"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Module scope</span>
                    <select
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                      value={form.workspace_id}
                      onChange={(e) => setForm((f) => ({ ...f, workspace_id: e.target.value }))}
                    >
                      {AI_TRAINING_WORKSPACE_OPTIONS.map((opt) => (
                        <option key={opt.value || "all"} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <PrimaryButton type="submit" showIcon={false} disabled={savingKnowledge}>
                    {form.id ? "Update note" : "Save platform note"}
                  </PrimaryButton>
                  {form.id ? (
                    <button
                      type="button"
                      onClick={resetKnowledgeForm}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Cancel edit
                    </button>
                  ) : null}
                </div>
              </form>
            </div>

            <div className="theme-panel flex min-h-[min(70vh,640px)] flex-col rounded-xl border bg-white p-5 shadow-sm">
              <div className="flex shrink-0 items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Saved notes</h3>
                <select
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                  value={filterWorkspace}
                  onChange={(e) => setFilterWorkspace(e.target.value)}
                >
                  {AI_TRAINING_WORKSPACE_OPTIONS.map((opt) => (
                    <option key={opt.value || "all"} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {loadingKnowledge ? (
                <p className="mt-4 text-sm text-slate-500">Loading…</p>
              ) : knowledge.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">No platform training notes yet.</p>
              ) : (
                <ul className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {knowledge.map((entry) => (
                    <li key={entry.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{entry.topic}</p>
                          <p className="mt-1 whitespace-pre-wrap text-slate-600">{entry.content}</p>
                          <p className="mt-2 text-xs text-slate-500">
                            Platform-wide
                            {entry.workspace_id ? ` · ${workspaceLabel(entry.workspace_id)}` : " · All modules"}
                            {entry.path ? ` · ${entry.path}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => editEntry(entry)}
                            className="rounded px-2 py-1 text-xs text-[#185FA5] hover:bg-slate-100"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteEntry(entry.id)}
                            className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="flex min-h-[560px] flex-col theme-panel rounded-xl border shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Test across modules</h2>
            <p className="mt-1 text-sm text-slate-500">
              Uses platform training credentials. Pick a tenant for sample data and permissions context — actions are
              preview-only and never change tenant AI settings.
            </p>

            {loadingOrgs ? (
              <p className="mt-3 text-sm text-slate-500">Loading organizations…</p>
            ) : (
              <label className="mt-3 block max-w-md text-sm">
                <span className="mb-1 block font-medium text-slate-700">Sample data organization</span>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={previewOrgId}
                  onChange={(e) => setPreviewOrgId(e.target.value)}
                >
                  <option value="">Select organization…</option>
                  {tenantOrgs.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.org_name} ({org.company_code})
                    </option>
                  ))}
                </select>
              </label>
            )}

            {!status?.enabled ? (
              <p className="mt-3 text-sm text-amber-800">
                Enable platform AI training and add an API key on the{" "}
                <Link href="/platform/ai-training/credentials" className="font-medium underline">
                  Credentials
                </Link>{" "}
                page before testing chat.
              </p>
            ) : !previewOrgId ? (
              <p className="mt-3 text-sm text-amber-800">
                Select a sample organization to preview answers with tenant data context.
              </p>
            ) : (
              <p className="mt-3 text-xs text-slate-500">
                Chat preview uses platform credentials with {previewOrg?.org_name ?? "tenant"} sample data — tenant AI
                settings are not used.
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-1">
              {AI_TRAINING_WORKSPACES.map((ws) => (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => switchTestWorkspace(ws.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    testWorkspace === ws.id
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {ws.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-600">
                  Testing <span className="font-medium">{workspaceLabel(testWorkspace)}</span> with platform knowledge
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {starters.slice(0, 4).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => sendChat(q)}
                      disabled={!status?.enabled || !previewOrgId}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {messages.map((m, i) => (
              <div
                key={i}
                className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "user" ? "ml-8 bg-indigo-50 text-indigo-900" : "mr-4 bg-slate-100 text-slate-800"
                }`}
              >
                {m.content}
              </div>
            ))}

            {formSpec?.fields?.length ? (
              <div className="mr-4">
                {pendingAction?.summary ? (
                  <p className="mb-1 text-sm font-medium text-slate-800">{pendingAction.summary}</p>
                ) : null}
                <AiActionForm
                  formSpec={{ ...formSpec, submit_label: "Preview confirm (no save)" }}
                  values={formValues}
                  loading={chatLoading}
                  onChange={(name, value) => setFormValues((prev) => ({ ...prev, [name]: value }))}
                  onSubmit={() => sendChat("confirm", { previewForm: true })}
                  onCancel={clearChatState}
                />
              </div>
            ) : pendingAction ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="font-medium text-amber-950">Proposed action (preview)</p>
                <p className="mt-1 text-amber-900">{pendingAction.summary ?? pendingAction.type}</p>
              </div>
            ) : null}

            {chatLoading ? <p className="text-center text-xs text-slate-500">Thinking…</p> : null}
            {chatError ? <p className="text-center text-xs text-red-600">{chatError}</p> : null}
            <div ref={bottomRef} />
          </div>

          <form
            className="border-t border-slate-200 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              sendChat(input);
            }}
          >
            <textarea
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder={
                previewOrgId
                  ? `Ask something in ${workspaceLabel(testWorkspace)}…`
                  : "Select a preview organization to test chat…"
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={chatLoading || !status?.enabled || !previewOrgId}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setMessages([]);
                  clearChatState();
                }}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Clear chat
              </button>
              <PrimaryButton
                type="submit"
                showIcon={false}
                disabled={chatLoading || !input.trim() || !status?.enabled || !previewOrgId}
              >
                Send test
              </PrimaryButton>
            </div>
          </form>
        </section>
      )}
    </CatalogPageShell>
  );
}
