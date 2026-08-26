"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell, PrimaryButton, inputClassName, SearchableSelect } from "@/components/catalog/catalog-shared";
import { AiActionForm, buildInitialFormValues } from "@/components/ai/ai-action-form";
import { AiMessageContent } from "@/components/ai/ai-message-content";
import { aiStartersForWorkspace } from "@/lib/ai-workspace";
import {
  AI_TRAINING_WORKSPACE_OPTIONS,
  AI_TRAINING_WORKSPACES,
  TRAINING_NOTES_EXPORT_COLUMNS,
  aiTrainingApiBase,
  aiTrainingWorkspacePath,
  bulkImportTrainingNotes,
  bulkDeleteTrainingNotes,
  deleteAllTrainingNotes,
  installFoundationTrainingNotes,
  mergeTrainingNotes,
  parseTrainingQaFile,
  parseTrainingQaPaste,
  scanTrainingNoteDuplicates,
  trainingNotesExportRows,
} from "@/lib/platform-ai-training";
import { downloadExcelFromObjects } from "@/lib/spreadsheet";
import { useBackgroundTasks } from "@/contexts/background-task-context";
import { queueReportExport, buildReportExportRequest } from "@/lib/report-export-api";
import { reportPrintedAt } from "@/lib/reports/export";
import { PLATFORM_COMPANY_CODE } from "@/lib/admin-scope";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";
import { PlatformAiTrainingNav } from "@/components/platform/platform-ai-training-nav";

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
          className={`rounded-lg px-3 py-1.5 text-xs transition ${
            activeTab === tab.id ? "theme-tab-active" : "theme-tab-inactive"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function PlatformAiTrainingScreen() {
  const confirm = useConfirm();
  const { runBackgroundTask } = useBackgroundTasks();
  const apiBase = aiTrainingApiBase();
  const [activeTab, setActiveTab] = useState("knowledge");

  const [knowledge, setKnowledge] = useState([]);
  const [filterWorkspace, setFilterWorkspace] = useState("");
  const [status, setStatus] = useState(null);
  const [loadingKnowledge, setLoadingKnowledge] = useState(false);
  const [savingKnowledge, setSavingKnowledge] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [savingBulk, setSavingBulk] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [deletingAllNotes, setDeletingAllNotes] = useState(false);
  const fileInputRef = useRef(null);
  const replaceFileInputRef = useRef(null);
  const [installingFoundation, setInstallingFoundation] = useState(false);
  const [duplicateThreshold, setDuplicateThreshold] = useState(85);
  const [duplicateScan, setDuplicateScan] = useState(null);
  const [scanningDuplicates, setScanningDuplicates] = useState(false);
  const [mergingClusterKey, setMergingClusterKey] = useState(null);
  /** @type {[Record<number, number[]>, Function]} selected note ids per duplicate cluster */
  const [selectedByCluster, setSelectedByCluster] = useState({});
  const [selectedNoteIds, setSelectedNoteIds] = useState(() => new Set());
  const [bulkDeletingNotes, setBulkDeletingNotes] = useState(false);
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
    try {
      const query = filterWorkspace
        ? `?workspace_id=${encodeURIComponent(filterWorkspace)}&limit=5000`
        : "?limit=5000";
      const res = await apiRequest(`${apiBase}/knowledge${query}`);
      setKnowledge(res.data ?? []);
    } catch (e) {
      setKnowledge([]);
      notifyError(e instanceof ApiError ? e.message : "Failed to load training notes.");
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
      notifyError(e instanceof ApiError ? e.message : "Failed to load organizations.");
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
    setSelectedNoteIds(new Set());
  }, [filterWorkspace]);

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
  }

  async function saveKnowledge(e) {
    e.preventDefault();
    if (!form.topic.trim() || !form.content.trim()) return;
    setSavingKnowledge(true);
    try {
      const payload = {
        topic: form.topic.trim(),
        content: form.content.trim(),
        path: form.path.trim() || null,
        workspace_id: form.workspace_id || null,
      };
      if (form.id) {
        await apiRequest(`${apiBase}/knowledge/${form.id}`, { method: "PATCH", body: payload });
        notifySuccess("Platform training note updated — applies to all tenants.");
      } else {
        await apiRequest(`${apiBase}/knowledge`, { method: "POST", body: payload });
        notifySuccess("Platform training note saved — applies to all tenants.");
      }
      resetKnowledgeForm();
      await loadKnowledge();
      await loadStatus();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to save training note.");
    } finally {
      setSavingKnowledge(false);
    }
  }

  async function deleteEntry(id) {
    const ok = await confirm({
      title: "Delete training note",
      message: "Delete this platform training note? It will stop applying to all tenants.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`${apiBase}/knowledge/${id}`, { method: "DELETE" });
      if (form.id === id) resetKnowledgeForm();
      setSelectedNoteIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await loadKnowledge();
      await loadStatus();
      notifySuccess("Training note deleted.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to delete training note.");
    }
  }

  async function installFoundation() {
    setInstallingFoundation(true);
    try {
      const res = await installFoundationTrainingNotes();
      await loadKnowledge();
      await loadStatus();
      notifySuccess(
        `Foundation notes: ${res.created ?? 0} added, ${res.skipped ?? 0} already present.`,
      );
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to install foundation notes.");
    } finally {
      setInstallingFoundation(false);
    }
  }

  async function importBulkQa(e) {
    e.preventDefault();
    const notes = parseTrainingQaPaste(bulkText);
    if (notes.length === 0) {
      notifyError("Paste Q:/A: blocks separated by blank lines.");
      return;
    }
    setSavingBulk(true);
    try {
      const res = await bulkImportTrainingNotes(notes);
      setBulkText("");
      await loadKnowledge();
      await loadStatus();
      notifySuccess(`Imported ${res.created ?? notes.length} training note(s).`);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Bulk import failed.");
    } finally {
      setSavingBulk(false);
    }
  }

  async function exportNotesExcel() {
    if (knowledge.length === 0) {
      notifyError("No training notes to export.");
      return;
    }
    setExportingExcel(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadExcelFromObjects(
        `centrix-ai-training-qa-${stamp}.xlsx`,
        "Q&A",
        trainingNotesExportRows(knowledge),
      );
      notifySuccess("Excel export downloaded.");
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Excel export failed.");
    } finally {
      setExportingExcel(false);
    }
  }

  function exportNotesPdf() {
    if (knowledge.length === 0) {
      notifyError("No training notes to export.");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const rows = trainingNotesExportRows(knowledge);
    void runBackgroundTask(
      () =>
        queueReportExport(
          buildReportExportRequest({
            format: "pdf",
            filename: `centrix-ai-training-qa-${stamp}`,
            title: "Centrix AI training Q&A",
            columns: TRAINING_NOTES_EXPORT_COLUMNS,
            meta: {
              title: "Centrix AI training Q&A",
              subtitle: filterWorkspace
                ? `Workspace: ${workspaceLabel(filterWorkspace)}`
                : "All platform training notes",
              printedAt: reportPrintedAt(),
            },
            getRows: async () => rows,
          }),
          async () => rows,
        ),
      {
        label: "Exporting AI training PDF",
        message: "Building PDF…",
        downloadOnComplete: true,
        downloadFilename: `centrix-ai-training-qa-${stamp}.pdf`,
      },
    );
  }

  async function deleteAllNotes() {
    const scopeLabel = filterWorkspace
      ? `for ${workspaceLabel(filterWorkspace)}`
      : "for every module";
    const ok = await confirm({
      title: "Delete all training notes",
      message: `Permanently delete all ${knowledge.length || noteCount} saved Q&A note(s) ${scopeLabel}? This cannot be undone.`,
      confirmLabel: "Delete all",
      destructive: true,
    });
    if (!ok) return;

    setDeletingAllNotes(true);
    try {
      const res = await deleteAllTrainingNotes({
        workspace_id: filterWorkspace || null,
      });
      resetKnowledgeForm();
      setSelectedNoteIds(new Set());
      setDuplicateScan(null);
      await loadKnowledge();
      await loadStatus();
      notifySuccess(`Deleted ${res.deleted ?? 0} training note(s).`);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to delete all notes.");
    } finally {
      setDeletingAllNotes(false);
    }
  }

  async function importQaFromFile(file, { replaceAll = false } = {}) {
    if (!file) return;
    setUploadingFile(true);
    try {
      const notes = await parseTrainingQaFile(file);
      if (notes.length === 0) {
        notifyError(
          "No Q&A rows found. Use columns question/topic + answer/content, or Q:/A: text blocks.",
        );
        return;
      }

      if (replaceAll) {
        const ok = await confirm({
          title: "Replace all training notes",
          message: `Delete all current notes${filterWorkspace ? ` in ${workspaceLabel(filterWorkspace)}` : ""} and import ${notes.length} note(s) from “${file.name}”?`,
          confirmLabel: "Delete & import",
          destructive: true,
        });
        if (!ok) return;
        await deleteAllTrainingNotes({ workspace_id: filterWorkspace || null });
      }

      const res = await bulkImportTrainingNotes(notes);
      resetKnowledgeForm();
      setSelectedNoteIds(new Set());
      await loadKnowledge();
      await loadStatus();
      notifySuccess(
        replaceAll
          ? `Replaced training set with ${res.created ?? notes.length} note(s).`
          : `Imported ${res.created ?? notes.length} note(s) from file.`,
      );
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "File import failed.");
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (replaceFileInputRef.current) replaceFileInputRef.current.value = "";
    }
  }

  async function scanDuplicates() {
    setScanningDuplicates(true);
    try {
      const res = await scanTrainingNoteDuplicates({
        workspace_id: filterWorkspace || null,
        threshold: duplicateThreshold,
      });
      setDuplicateScan(res);
      const defaults = {};
      for (const [idx, cluster] of (res.clusters ?? []).entries()) {
        // Pre-select all but the newest (first) note as candidates to merge/remove.
        const ids = (cluster.entries ?? []).map((e) => e.id).filter(Boolean);
        defaults[idx] = ids.slice(1);
      }
      setSelectedByCluster(defaults);
    } catch (err) {
      setDuplicateScan(null);
      notifyError(err instanceof ApiError ? err.message : "Failed to scan for duplicates.");
    } finally {
      setScanningDuplicates(false);
    }
  }

  function toggleClusterNote(clusterIndex, entryId) {
    setSelectedByCluster((prev) => {
      const current = new Set(prev[clusterIndex] ?? []);
      if (current.has(entryId)) current.delete(entryId);
      else current.add(entryId);
      return { ...prev, [clusterIndex]: [...current] };
    });
  }

  function toggleAllClusterNotes(clusterIndex, entryIds, selectAll) {
    setSelectedByCluster((prev) => ({
      ...prev,
      [clusterIndex]: selectAll ? [...entryIds] : [],
    }));
  }

  function clusterActionIds(clusterIndex) {
    const cluster = duplicateScan?.clusters?.[clusterIndex];
    if (!cluster?.entries?.length) return { keepId: null, actionIds: [] };

    const selected = new Set(selectedByCluster[clusterIndex] ?? []);
    const allIds = cluster.entries.map((e) => e.id);
    const actionIds = allIds.filter((id) => selected.has(id));
    const unselected = allIds.filter((id) => !selected.has(id));
    // Keep the first unselected note; if everything is selected, keep the first and act on the rest.
    const keepId = unselected[0] ?? allIds[0] ?? null;
    const mergeOrRemoveIds = actionIds.filter((id) => id !== keepId);

    return { keepId, actionIds: mergeOrRemoveIds };
  }

  async function mergeDuplicateCluster(clusterIndex) {
    const { keepId, actionIds } = clusterActionIds(clusterIndex);
    if (!keepId || actionIds.length === 0) {
      notifyError("Select at least one note to merge into the note you leave unchecked.");
      return;
    }

    const ok = await confirm({
      title: "Merge duplicate notes",
      message: `Merge ${actionIds.length} selected note(s) into the kept note? Selected notes will be deleted after combining content.`,
      confirmLabel: "Merge",
    });
    if (!ok) return;

    setMergingClusterKey(String(clusterIndex));
    try {
      await mergeTrainingNotes({ keep_id: keepId, merge_ids: actionIds });
      setSelectedNoteIds(new Set());
      await loadKnowledge();
      await loadStatus();
      await scanDuplicates();
      notifySuccess("Duplicate notes merged.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to merge notes.");
    } finally {
      setMergingClusterKey(null);
    }
  }

  async function removeDuplicateCluster(clusterIndex) {
    const { actionIds } = clusterActionIds(clusterIndex);
    if (actionIds.length === 0) {
      notifyError("Select at least one note to remove.");
      return;
    }

    const ok = await confirm({
      title: "Remove duplicate notes",
      message: `Delete ${actionIds.length} selected note(s)? Unchecked notes are kept.`,
      confirmLabel: "Remove selected",
      destructive: true,
    });
    if (!ok) return;

    setMergingClusterKey(String(clusterIndex));
    try {
      await bulkDeleteTrainingNotes(actionIds);
      setSelectedNoteIds(new Set());
      await loadKnowledge();
      await loadStatus();
      await scanDuplicates();
      notifySuccess("Duplicate notes removed.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to remove duplicates.");
    } finally {
      setMergingClusterKey(null);
    }
  }

  /**
   * For each cluster, keep the newest (first) note and act on the rest.
   * @returns {Array<{ keepId: number, actionIds: number[] }>}
   */
  function allClusterDuplicateActions() {
    return (duplicateScan?.clusters ?? [])
      .map((cluster) => {
        const allIds = (cluster.entries ?? []).map((e) => e.id).filter(Boolean);
        if (allIds.length < 2) return null;
        return {
          keepId: allIds[0],
          actionIds: allIds.slice(1),
        };
      })
      .filter(Boolean);
  }

  async function bulkDeleteInChunks(ids) {
    const chunkSize = 100;
    let deleted = 0;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const res = await bulkDeleteTrainingNotes(chunk);
      deleted += Number(res.deleted ?? chunk.length);
    }
    return deleted;
  }

  async function mergeAllDuplicates() {
    const plans = allClusterDuplicateActions();
    if (plans.length === 0) {
      notifyError("No duplicate clusters to merge.");
      return;
    }
    const extraCount = plans.reduce((sum, p) => sum + p.actionIds.length, 0);
    const ok = await confirm({
      title: "Merge all duplicates",
      message: `Merge ${plans.length} cluster(s): keep the newest note in each and combine ${extraCount} duplicate(s) into them?`,
      confirmLabel: "Merge all",
    });
    if (!ok) return;

    setMergingClusterKey("merge-all");
    try {
      let merged = 0;
      for (const plan of plans) {
        await mergeTrainingNotes({ keep_id: plan.keepId, merge_ids: plan.actionIds });
        merged += plan.actionIds.length;
      }
      setSelectedNoteIds(new Set());
      setSelectedByCluster({});
      await loadKnowledge();
      await loadStatus();
      await scanDuplicates();
      notifySuccess(`Merged ${merged} duplicate note(s) across ${plans.length} cluster(s).`);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to merge all duplicates.");
      await loadKnowledge();
      await scanDuplicates();
    } finally {
      setMergingClusterKey(null);
    }
  }

  async function deleteAllDuplicates() {
    const plans = allClusterDuplicateActions();
    if (plans.length === 0) {
      notifyError("No duplicate notes to delete.");
      return;
    }
    const ids = plans.flatMap((p) => p.actionIds);
    const ok = await confirm({
      title: "Delete all duplicates",
      message: `Delete ${ids.length} duplicate note(s) across ${plans.length} cluster(s)? The newest note in each cluster is kept.`,
      confirmLabel: "Delete all duplicates",
      destructive: true,
    });
    if (!ok) return;

    setMergingClusterKey("delete-all");
    try {
      const deleted = await bulkDeleteInChunks(ids);
      if (form.id && ids.includes(form.id)) resetKnowledgeForm();
      setSelectedNoteIds(new Set());
      setSelectedByCluster({});
      await loadKnowledge();
      await loadStatus();
      await scanDuplicates();
      notifySuccess(`Deleted ${deleted} duplicate note(s).`);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to delete all duplicates.");
      await loadKnowledge();
      await scanDuplicates();
    } finally {
      setMergingClusterKey(null);
    }
  }

  function toggleNoteSelection(id) {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllNotes() {
    setSelectedNoteIds((prev) => {
      if (knowledge.length > 0 && prev.size === knowledge.length) return new Set();
      return new Set(knowledge.map((e) => e.id));
    });
  }

  async function deleteSelectedNotes() {
    const ids = [...selectedNoteIds];
    if (ids.length === 0) return;

    const ok = await confirm({
      title: "Delete selected notes",
      message: `Delete ${ids.length} platform training note(s)? They will stop applying to all tenants.`,
      confirmLabel: "Delete selected",
      destructive: true,
    });
    if (!ok) return;

    setBulkDeletingNotes(true);
    try {
      await bulkDeleteTrainingNotes(ids);
      if (form.id && ids.includes(form.id)) resetKnowledgeForm();
      setSelectedNoteIds(new Set());
      await loadKnowledge();
      await loadStatus();
      notifySuccess(`Deleted ${ids.length} training note(s).`);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to delete selected notes.");
    } finally {
      setBulkDeletingNotes(false);
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

      {activeTab === "knowledge" ? (
        <section className="theme-panel rounded-xl border p-6 shadow-sm">
          <div className="border-b border-[var(--theme-border)] pb-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="theme-heading text-base font-semibold">Train Centrix AI (Q&A notes)</h2>
                <p className="theme-subtext mt-2 max-w-4xl text-sm">
                  Teach the assistant once for every tenant with a sample question and a sample of how to respond
                  (approach, facts pattern, and screen path). Notes are matched by relevance — the AI uses them as
                  style guides and writes a fresh answer for each user; it does not paste the saved answer verbatim.
                  Live numbers (sales, stock, attendance) still come from tools. Centrix AI accepts questions in English only.
                </p>
                <p className="theme-text-muted mt-2 text-xs">
                  {noteCount} platform note{noteCount === 1 ? "" : "s"} active · Test answers in the Test console tab
                </p>
              </div>
            <div className="flex flex-wrap items-start gap-2">
              <button
                type="button"
                disabled={exportingExcel || knowledge.length === 0}
                onClick={() => void exportNotesExcel()}
                className="theme-secondary-btn rounded-lg px-3 py-2 text-xs disabled:opacity-50"
              >
                {exportingExcel ? "Exporting…" : "Export Excel"}
              </button>
              <button
                type="button"
                disabled={knowledge.length === 0}
                onClick={() => exportNotesPdf()}
                className="theme-secondary-btn rounded-lg px-3 py-2 text-xs disabled:opacity-50"
              >
                Export PDF
              </button>
              <button
                type="button"
                disabled={deletingAllNotes || (knowledge.length === 0 && noteCount === 0)}
                onClick={() => void deleteAllNotes()}
                className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {deletingAllNotes ? "Deleting…" : "Delete all"}
              </button>
              <PrimaryButton
                type="button"
                showIcon={false}
                disabled={installingFoundation}
                onClick={() => void installFoundation()}
              >
                {installingFoundation ? "Installing…" : "Install foundation notes"}
              </PrimaryButton>
            </div>
            </div>
          </div>

          <div className="mt-6 grid gap-8 xl:grid-cols-2 xl:items-start">
            <div className="space-y-6">
              <div className="theme-inset-panel min-h-0 rounded-xl border p-5 shadow-sm">
                <h3 className="theme-heading text-sm font-semibold">
                  {form.id ? "Edit Q&A note" : "Add Q&A note"}
                </h3>
                <p className="theme-subtext mt-1 text-sm">
                  Topic = a sample question users ask. Content = a sample of how Centrix should think and reply
                  (include the path). The assistant adapts this style — it does not quote the answer word-for-word.
                </p>

                <form onSubmit={saveKnowledge} className="mt-4 flex min-h-[min(52vh,480px)] flex-col gap-3">
                  <label className="block text-sm">
                    <span className="theme-heading mb-1 block font-medium">Sample question</span>
                    <input
                      className={inputClassName()}
                      value={form.topic}
                      onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
                      placeholder="e.g. Is stock counted in kg or bags?"
                      required
                    />
                  </label>
                  <label className="block min-h-0 flex-1 text-sm">
                    <span className="theme-heading mb-1 block font-medium">Sample answer style</span>
                    <textarea
                      className={`${inputClassName()} min-h-[min(28vh,240px)] flex-1`}
                      value={form.content}
                      onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                      placeholder="Show the approach and screen path, e.g. Explain UoM base units… then open /uoms — AI will adapt this, not quote it"
                      required
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="theme-heading mb-1 block font-medium">Related path (optional)</span>
                      <input
                        className={inputClassName()}
                        value={form.path}
                        onChange={(e) => setForm((f) => ({ ...f, path: e.target.value }))}
                        placeholder="/uoms"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="theme-heading mb-1 block font-medium">Module scope</span>
                      <SearchableSelect
                        className={inputClassName()}
                        value={form.workspace_id}
                        nativeEvent
                        onChange={(e) => setForm((f) => ({ ...f, workspace_id: e.target.value }))}
                        options={AI_TRAINING_WORKSPACE_OPTIONS.map((opt) => ({
                          value: opt.value,
                          label: opt.label,
                        }))}
                      />
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
                        className="theme-secondary-btn rounded-lg px-4 py-2 text-sm"
                      >
                        Cancel edit
                      </button>
                    ) : null}
                  </div>
                </form>
              </div>

              <div className="theme-inset-panel rounded-xl border p-5 shadow-sm">
                <h3 className="theme-heading text-sm font-semibold">Bulk paste Q&A</h3>
                <p className="theme-subtext mt-1 text-sm">
                  Paste many notes at once. Separate pairs with a blank line:
                </p>
                <pre className="theme-text-muted mt-2 overflow-x-auto rounded-md bg-[var(--theme-page-bg)] p-3 text-xs">
{`Q: Where is GRN?
A: Open /inventory/receipts to receive goods.
Path: /inventory/receipts

Q: How do I set retail packaging?
A: Enable Sell on retail, then configure /retail-package-settings.`}
                </pre>
                <form onSubmit={importBulkQa} className="mt-3 flex flex-col gap-3">
                  <textarea
                    className={`${inputClassName()} min-h-40`}
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder="Paste Q:/A: blocks here…"
                  />
                  <PrimaryButton type="submit" showIcon={false} disabled={savingBulk || !bulkText.trim()}>
                    {savingBulk ? "Importing…" : "Import Q&A notes"}
                  </PrimaryButton>
                </form>
              </div>

              <div className="theme-inset-panel rounded-xl border p-5 shadow-sm">
                <h3 className="theme-heading text-sm font-semibold">Upload / replace Q&A file</h3>
                <p className="theme-subtext mt-1 text-sm">
                  Upload Excel (.xlsx), CSV, or a text/markdown file with Q&A. Spreadsheet columns:{" "}
                  <span className="font-medium">question</span> (or topic),{" "}
                  <span className="font-medium">answer</span> (or content), optional path / workspace_id.
                  Export Excel first for a ready template.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt,.md,text/plain,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void importQaFromFile(file, { replaceAll: false });
                  }}
                />
                <input
                  ref={replaceFileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt,.md,text/plain,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void importQaFromFile(file, { replaceAll: true });
                  }}
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  <PrimaryButton
                    type="button"
                    showIcon={false}
                    disabled={uploadingFile}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploadingFile ? "Importing…" : "Upload & add notes"}
                  </PrimaryButton>
                  <button
                    type="button"
                    disabled={uploadingFile}
                    onClick={() => replaceFileInputRef.current?.click()}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-50"
                  >
                    Delete all & re-upload
                  </button>
                </div>
              </div>
            </div>

            <div className="theme-inset-panel flex min-h-[min(70vh,640px)] flex-col rounded-xl border p-5 shadow-sm">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                <h3 className="theme-heading text-sm font-semibold">Saved notes</h3>
                <SearchableSelect
                  className={`${inputClassName()} px-2 py-1 text-xs`}
                  value={filterWorkspace}
                  nativeEvent
                  onChange={(e) => setFilterWorkspace(e.target.value)}
                  options={AI_TRAINING_WORKSPACE_OPTIONS.map((opt) => ({
                    value: opt.value,
                    label: opt.label,
                  }))}
                />
              </div>

              <div className="mt-4 shrink-0 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-page-bg)] p-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="theme-heading text-xs font-semibold">Duplicate questions</p>
                    <p className="theme-subtext mt-1 text-xs">
                      Scan saved notes for similar topics — merge answers or remove extras after bulk import.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="theme-subtext flex items-center gap-1 text-xs">
                      Match
                      <input
                        type="number"
                        min={50}
                        max={100}
                        className={`${inputClassName()} w-16 px-2 py-1 text-xs`}
                        value={duplicateThreshold}
                        onChange={(e) => setDuplicateThreshold(Number(e.target.value) || 85)}
                      />
                      %
                    </label>
                    <PrimaryButton
                      type="button"
                      showIcon={false}
                      disabled={scanningDuplicates}
                      onClick={() => void scanDuplicates()}
                    >
                      {scanningDuplicates ? "Scanning…" : "Scan duplicates"}
                    </PrimaryButton>
                  </div>
                </div>

                {duplicateScan ? (
                  <div className="mt-3 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="theme-subtext text-xs">
                        {duplicateScan.cluster_count > 0
                          ? `${duplicateScan.cluster_count} cluster(s) · ${duplicateScan.duplicate_entry_count} extra note(s) can be merged or removed`
                          : "No duplicate topics found at this threshold."}
                      </p>
                      {duplicateScan.cluster_count > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          <PrimaryButton
                            type="button"
                            showIcon={false}
                            disabled={mergingClusterKey != null || scanningDuplicates}
                            onClick={() => void mergeAllDuplicates()}
                          >
                            {mergingClusterKey === "merge-all" ? "Merging…" : "Merge all duplicates"}
                          </PrimaryButton>
                          <button
                            type="button"
                            disabled={mergingClusterKey != null || scanningDuplicates}
                            onClick={() => void deleteAllDuplicates()}
                            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            {mergingClusterKey === "delete-all" ? "Deleting…" : "Delete all duplicates"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {(duplicateScan.clusters ?? []).map((cluster, clusterIndex) => {
                      const entryIds = (cluster.entries ?? []).map((e) => e.id);
                      const selectedIds = new Set(selectedByCluster[clusterIndex] ?? []);
                      const allSelected = entryIds.length > 0 && entryIds.every((id) => selectedIds.has(id));
                      const selectedCount = entryIds.filter((id) => selectedIds.has(id)).length;

                      return (
                      <div
                        key={`dup-${clusterIndex}-${cluster.entries?.[0]?.id ?? clusterIndex}`}
                        className="rounded-md border border-[var(--theme-border)] p-3 text-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-3">
                            <p className="theme-heading text-xs font-medium">
                              {cluster.similarity}% similar · {cluster.entries?.length ?? 0} notes
                              {selectedCount > 0 ? ` · ${selectedCount} selected` : ""}
                            </p>
                            <label className="theme-subtext flex cursor-pointer items-center gap-1.5 text-xs">
                              <input
                                type="checkbox"
                                checked={allSelected}
                                onChange={(e) =>
                                  toggleAllClusterNotes(clusterIndex, entryIds, e.target.checked)
                                }
                              />
                              Select all
                            </label>
                          </div>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              disabled={mergingClusterKey != null || selectedCount === 0}
                              onClick={() => void mergeDuplicateCluster(clusterIndex)}
                              className="theme-link rounded px-2 py-1 text-xs hover:bg-[var(--theme-hover)] disabled:opacity-40"
                            >
                              Merge selected
                            </button>
                            <button
                              type="button"
                              disabled={mergingClusterKey != null || selectedCount === 0}
                              onClick={() => void removeDuplicateCluster(clusterIndex)}
                              className="rounded px-2 py-1 text-xs text-red-500 hover:bg-[color-mix(in_srgb,#ef4444_12%,var(--theme-page-bg))] disabled:opacity-40"
                            >
                              Remove selected
                            </button>
                          </div>
                        </div>
                        <p className="theme-subtext mt-1 text-[11px]">
                          Checked notes are merged or removed. Leave at least one unchecked to keep.
                        </p>
                        <ul className="mt-2 space-y-2">
                          {(cluster.entries ?? []).map((entry) => (
                            <li
                              key={entry.id}
                              className="rounded border border-[var(--theme-border)] p-2 text-xs"
                            >
                              <label className="flex cursor-pointer items-start gap-2">
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(entry.id)}
                                  onChange={() => toggleClusterNote(clusterIndex, entry.id)}
                                  className="mt-0.5"
                                />
                                <span className="min-w-0">
                                  <span className="theme-heading font-medium">{entry.topic}</span>
                                  <span className="theme-text-muted mt-1 block whitespace-pre-wrap line-clamp-3">
                                    {entry.content}
                                  </span>
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              {loadingKnowledge ? (
                <p className="theme-subtext mt-4 text-sm">Loading…</p>
              ) : knowledge.length === 0 ? (
                <p className="theme-subtext mt-4 text-sm">
                  No platform training notes yet. Click &quot;Install foundation notes&quot; or add a Q&A above.
                </p>
              ) : (
                <>
                  <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-2">
                    <label className="theme-subtext flex cursor-pointer items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={knowledge.length > 0 && selectedNoteIds.size === knowledge.length}
                        onChange={toggleSelectAllNotes}
                      />
                      Select all ({selectedNoteIds.size}/{knowledge.length})
                    </label>
                    <button
                      type="button"
                      disabled={selectedNoteIds.size === 0 || bulkDeletingNotes}
                      onClick={() => void deleteSelectedNotes()}
                      className="rounded px-2 py-1 text-xs text-red-500 hover:bg-[color-mix(in_srgb,#ef4444_12%,var(--theme-page-bg))] disabled:opacity-40"
                    >
                      {bulkDeletingNotes
                        ? "Deleting…"
                        : `Delete selected${selectedNoteIds.size ? ` (${selectedNoteIds.size})` : ""}`}
                    </button>
                  </div>
                <ul className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {knowledge.map((entry) => (
                    <li key={entry.id} className="rounded-lg border border-[var(--theme-border)] p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-1 shrink-0"
                            checked={selectedNoteIds.has(entry.id)}
                            onChange={() => toggleNoteSelection(entry.id)}
                          />
                          <div className="min-w-0">
                            <p className="theme-heading font-medium">{entry.topic}</p>
                            <p className="theme-text-muted mt-1 whitespace-pre-wrap">{entry.content}</p>
                            <p className="theme-subtext mt-2 text-xs">
                              Platform-wide
                              {entry.workspace_id ? ` · ${workspaceLabel(entry.workspace_id)}` : " · All modules"}
                              {entry.path ? ` · ${entry.path}` : ""}
                            </p>
                          </div>
                        </label>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => editEntry(entry)}
                            className="theme-link rounded px-2 py-1 text-xs hover:bg-[var(--theme-hover)]"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteEntry(entry.id)}
                            className="rounded px-2 py-1 text-xs text-red-500 hover:bg-[color-mix(in_srgb,#ef4444_12%,var(--theme-page-bg))]"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                </>
              )}
            </div>
          </div>
        </section>
      ) : activeTab === "test" ? (
        <section className="theme-panel flex min-h-[560px] flex-col rounded-xl border shadow-sm">
          <div className="border-b border-[var(--theme-border)] px-5 py-4">
            <h2 className="theme-heading text-sm font-semibold">Test across modules</h2>
            <p className="theme-subtext mt-1 text-sm">
              Uses platform training credentials. Pick a tenant for sample data and permissions context — actions are
              preview-only and never change tenant AI settings.
            </p>

            {loadingOrgs ? (
              <p className="theme-subtext mt-3 text-sm">Loading organizations…</p>
            ) : (
              <label className="mt-3 block max-w-md text-sm">
                <span className="theme-heading mb-1 block font-medium">Sample data organization</span>
                <SearchableSelect
  className={inputClassName()}
  value={previewOrgId}
  nativeEvent
  onChange={((e) => setPreviewOrgId(e.target.value))}
  options={tenantOrgs.map((org) => ({ value: org.id, label: `${org.org_name} (${org.company_code})` }))}
/>
              </label>
            )}

            {!status?.enabled ? (
              <p className="theme-text-muted mt-3 text-sm">
                Enable platform AI and add an API key under{" "}
                <Link href="/platform/settings?tab=ai" className="theme-link font-medium underline">
                  Platform settings → AI credentials
                </Link>{" "}
                before testing chat.
              </p>
            ) : !previewOrgId ? (
              <p className="theme-text-muted mt-3 text-sm">
                Select a sample organization to preview answers with tenant data context.
              </p>
            ) : (
              <p className="theme-subtext mt-3 text-xs">
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
                  className={`rounded-lg px-3 py-1.5 text-xs transition ${
                    testWorkspace === ws.id ? "theme-tab-active" : "theme-tab-inactive"
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
                <p className="theme-text-muted text-sm">
                  Testing <span className="theme-heading font-medium">{workspaceLabel(testWorkspace)}</span> with platform knowledge
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {starters.slice(0, 4).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => sendChat(q)}
                      disabled={!status?.enabled || !previewOrgId}
                      className="theme-secondary-btn rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-50"
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
                className={`rounded-lg px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "ml-8 whitespace-pre-wrap bg-[var(--theme-primary-subtle)] theme-heading"
                    : "mr-4 bg-[var(--theme-surface-muted)] theme-text-muted"
                }`}
              >
                {m.role === "assistant" ? <AiMessageContent content={m.content} /> : m.content}
              </div>
            ))}

            {formSpec?.fields?.length &&
            (String(pendingAction?.type ?? "").startsWith("create_") ||
              pendingAction?.type === "record_customer_payment") ? (
              <div className="mr-4">
                {pendingAction?.summary ? (
                  <p className="theme-heading mb-1 text-sm font-medium">{pendingAction.summary}</p>
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
            ) : null}

            {chatLoading ? <p className="theme-subtext text-center text-xs">Thinking…</p> : null}
            {chatError ? <p className="text-center text-xs text-red-500">{chatError}</p> : null}
            <div ref={bottomRef} />
          </div>

          <form
            className="border-t border-[var(--theme-border)] p-3"
            onSubmit={(e) => {
              e.preventDefault();
              sendChat(input);
            }}
          >
            <textarea
              rows={3}
              className={inputClassName()}
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
                className="theme-subtext text-xs hover:text-[var(--theme-text)]"
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
      ) : null}
    </CatalogPageShell>
  );
}
