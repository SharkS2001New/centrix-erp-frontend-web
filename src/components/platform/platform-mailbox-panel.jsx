"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { PrimaryButton, SECONDARY_BTN_CLASS, TrashIcon } from "@/components/catalog/catalog-shared";
import { PlatformAiEmailAssist } from "@/components/platform/platform-ai-email-assist";
import { formatBillingMoney } from "@/lib/platform-billing";
import { useConfirm } from "@/lib/use-confirm";
import { mailboxAccountLabel } from "@/lib/platform-mail-settings";
import {
  PLATFORM_MAIL_AUTO_SYNC_KEY,
  publishPlatformMailUnread,
} from "@/lib/platform-mailbox-unread";

const MAILBOX_ACCOUNT_KEY = "centrix.platform_mail.active_account_id";
const PAGE_SIZE = 20;

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

const deleteBtnClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:opacity-60";

function emptyCompose() {
  return {
    draft_id: "",
    organization_id: "",
    invoice_id: "",
    to: "",
    subject: "",
    body: "",
  };
}

function formatWhen(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function previewBody(text, max = 90) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}…`;
}

function invoiceOptionLabel(inv) {
  const number = inv.invoice_number || `#${inv.id}`;
  const total = formatBillingMoney(inv.total, inv.currency);
  const status = inv.status ? String(inv.status) : "draft";
  return `${number} · ${total} · ${status}`;
}

function defaultInvoiceBody(invoice, orgName, fromName = "Centrix") {
  const name = invoice.bill_to_name || orgName || "Customer";
  const number = invoice.invoice_number || `#${invoice.id}`;
  const total = formatBillingMoney(invoice.total, invoice.currency);
  return `Dear ${name},\n\nPlease find attached invoice ${number} for ${total}.\n\nIf you have questions, reply to this email.\n\nRegards,\n${fromName}`;
}

function isSavedForAi(message) {
  return Boolean(message?.meta?.reply_memory?.use_for_ai);
}

function canSaveAsReplyMemory(message) {
  if (!message) return false;
  if (message.direction !== "outbound" || message.folder !== "sent") return false;
  const kind = message.meta?.kind || message.kind;
  return Boolean(message.in_reply_to || kind === "reply" || message.meta?.inbound_message_id);
}

export function PlatformMailboxPanel() {
  const confirm = useConfirm();
  const [folder, setFolder] = useState("inbox");
  const [kindFilter, setKindFilter] = useState("");
  const [mailStats, setMailStats] = useState(null);
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState(() => {
    try {
      return localStorage.getItem(MAILBOX_ACCOUNT_KEY) || "";
    } catch {
      return "";
    }
  });
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [thread, setThread] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [composing, setComposing] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [compose, setCompose] = useState(() => emptyCompose());
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [listTotal, setListTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [similarReplies, setSimilarReplies] = useState([]);
  const [saveReplyForAi, setSaveReplyForAi] = useState(false);
  const [savingReplyMemory, setSavingReplyMemory] = useState(false);
  const autoSyncStarted = useRef(false);
  const [organizations, setOrganizations] = useState([]);
  const [orgInvoices, setOrgInvoices] = useState([]);
  const [loadingOrgInvoices, setLoadingOrgInvoices] = useState(false);
  const [composeTemplates, setComposeTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [templateSaveAsUpdate, setTemplateSaveAsUpdate] = useState(false);

  const activeAccount =
    accounts.find((row) => String(row.id) === String(accountId)) || accounts[0] || null;

  const loadList = useCallback(async ({ append = false, offset = 0 } = {}) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const res = await apiRequest("/admin/platform-mail/messages", {
        searchParams: {
          folder,
          limit: PAGE_SIZE,
          offset,
          ...(search.trim() ? { q: search.trim() } : {}),
          ...(folder === "sent" && kindFilter ? { kind: kindFilter } : {}),
          ...(accountId ? { account_id: accountId } : {}),
        },
        loading: false,
      });
      const rows = Array.isArray(res.data) ? res.data : [];
      setMessages((prev) => (append ? [...prev, ...rows] : rows));
      const nextUnread = Number(res.unread_count || 0);
      setUnreadCount(nextUnread);
      publishPlatformMailUnread(nextUnread);
      setHasMore(Boolean(res.has_more));
      setListTotal(Number(res.total || rows.length));
      if (res.stats) setMailStats(res.stats);
      if (Array.isArray(res.accounts)) {
        setAccounts(res.accounts);
        if (!accountId && res.active_account_id) {
          setAccountId(res.active_account_id);
        } else if (!accountId && res.accounts[0]?.id) {
          setAccountId(res.accounts[0].id);
        }
      }
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load mailbox.");
      if (!append) setMessages([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [folder, search, kindFilter, accountId]);

  function selectAccount(nextId) {
    setAccountId(nextId);
    setAccountMenuOpen(false);
    setSelectedId(null);
    setSelected(null);
    setComposing(false);
    setSimilarReplies([]);
    try {
      localStorage.setItem(MAILBOX_ACCOUNT_KEY, nextId);
    } catch {
      /* ignore */
    }
  }

  const loadOrganizations = useCallback(async () => {
    try {
      const res = await apiRequest("/admin/organizations", { loading: false });
      setOrganizations(res.data ?? []);
    } catch {
      setOrganizations([]);
    }
  }, []);

  const loadComposeTemplates = useCallback(async () => {
    try {
      const res = await apiRequest("/admin/platform-mail/compose-templates", { loading: false });
      setComposeTemplates(Array.isArray(res.data) ? res.data : []);
    } catch {
      setComposeTemplates([]);
    }
  }, []);

  const loadOrgInvoices = useCallback(async (organizationId) => {
    if (!organizationId) {
      setOrgInvoices([]);
      return;
    }
    setLoadingOrgInvoices(true);
    try {
      const res = await apiRequest("/admin/platform-invoices", {
        searchParams: { organization_id: organizationId },
        loading: false,
      });
      setOrgInvoices(res.data ?? []);
    } catch {
      setOrgInvoices([]);
    } finally {
      setLoadingOrgInvoices(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    void loadList({ append: false, offset: 0 });
  }, [loadList]);

  useEffect(() => {
    if (autoSyncStarted.current) return;
    autoSyncStarted.current = true;
    let already = false;
    try {
      already = sessionStorage.getItem(PLATFORM_MAIL_AUTO_SYNC_KEY) === "1";
    } catch {
      already = false;
    }
    if (already) return;

    try {
      sessionStorage.setItem(PLATFORM_MAIL_AUTO_SYNC_KEY, "1");
    } catch {
      /* ignore */
    }

    (async () => {
      setSyncing(true);
      try {
        const res = await apiRequest("/admin/platform-mail/sync", {
          method: "POST",
          body: { account_id: accountId || undefined, limit: 50 },
          loading: false,
        });
        if (Number(res.imported || 0) > 0) {
          notifySuccess(res.message ?? "New mail synced.");
          await loadList({ append: false, offset: 0 });
        }
      } catch {
        /* Auto-sync is best-effort; manual Sync inbox remains available. */
      } finally {
        setSyncing(false);
      }
    })();
  }, [accountId, loadList]);

  useEffect(() => {
    if (composing) {
      void loadOrganizations();
      void loadComposeTemplates();
    }
  }, [composing, loadOrganizations, loadComposeTemplates]);

  useEffect(() => {
    if (composing) void loadOrgInvoices(compose.organization_id);
  }, [composing, compose.organization_id, loadOrgInvoices]);

  async function openMessage(id) {
    setComposing(false);
    setSelectedId(id);
    setReplyBody("");
    setSimilarReplies([]);
    setSaveReplyForAi(false);
    const wasUnread = messages.some((row) => row.id === id && row.folder === "inbox" && !row.read_at);
    try {
      const res = await apiRequest(`/admin/platform-mail/messages/${id}`, { loading: false });
      const msg = res.data ?? null;
      setSelected(msg);
      setThread(Array.isArray(res.thread) ? res.thread : []);

      if (wasUnread) {
        setMessages((prev) =>
          prev.map((row) =>
            row.id === id ? { ...row, read_at: msg?.read_at || new Date().toISOString() } : row,
          ),
        );
        setUnreadCount((prev) => {
          const next = Math.max(0, prev - 1);
          publishPlatformMailUnread(next);
          return next;
        });
      }

      if (msg?.direction === "inbound") {
        // Similar responses are loaded only when the user clicks
        // "Check through similar responses".
        setSimilarReplies([]);
      }

      if (msg?.folder === "drafts") {
        const to =
          Array.isArray(msg.to_addresses) && msg.to_addresses[0] ? String(msg.to_addresses[0]) : "";
        const orgId = msg.organization_id || msg.meta?.organization_id || "";
        const invoiceId = msg.meta?.invoice_id || "";
        setCompose({
          draft_id: String(msg.id),
          organization_id: orgId ? String(orgId) : "",
          invoice_id: invoiceId ? String(invoiceId) : "",
          to,
          subject: msg.subject || "",
          body: msg.body_text || "",
        });
        setComposing(true);
        setSelected(null);
        setSelectedId(null);
        setSimilarReplies([]);
        if (orgId) void loadOrgInvoices(String(orgId));
      }
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to open message.");
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await apiRequest("/admin/platform-mail/sync", {
        method: "POST",
        body: { account_id: accountId || undefined },
      });
      notifySuccess(res.message ?? "Inbox synced.");
      await loadList({ append: false, offset: 0 });
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "IMAP sync failed.";
      const detail = e instanceof ApiError ? e.body?.detail : null;
      notifyError(
        detail
          ? `${message} ${detail}`
          : `${message} Check Platform settings → Email delivery → IMAP, or use Copy from SMTP and Test IMAP.`,
      );
    } finally {
      setSyncing(false);
    }
  }

  function applyOrganization(organizationId) {
    const org = organizations.find((row) => String(row.id) === String(organizationId));
    setCompose((prev) => {
      const next = {
        ...prev,
        organization_id: organizationId,
        invoice_id: "",
      };
      if (org) {
        if (org.org_email) next.to = org.org_email;
        if (!prev.subject.trim()) {
          next.subject = org.org_name ? `Centrix ERP — ${org.org_name}` : prev.subject;
        }
        if (!prev.body.trim()) {
          next.body = `Dear ${org.org_name || "Customer"},\n\n`;
        } else if (prev.body.startsWith("Dear ") && !prev.invoice_id) {
          next.body = prev.body.replace(/^Dear [^\n]*/, `Dear ${org.org_name || "Customer"}`);
        }
      }
      return next;
    });
  }

  function applyInvoice(invoiceId) {
    const invoice = orgInvoices.find((row) => String(row.id) === String(invoiceId));
    if (!invoiceId) {
      setCompose((prev) => ({ ...prev, invoice_id: "" }));
      return;
    }
    if (!invoice) {
      setCompose((prev) => ({ ...prev, invoice_id: invoiceId }));
      return;
    }

    const org = organizations.find(
      (row) => String(row.id) === String(invoice.organization_id || compose.organization_id),
    );
    const number = invoice.invoice_number || `#${invoice.id}`;
    setCompose((prev) => ({
      ...prev,
      invoice_id: String(invoice.id),
      organization_id: invoice.organization_id
        ? String(invoice.organization_id)
        : prev.organization_id,
      to:
        invoice.bill_to_email ||
        org?.org_email ||
        prev.to,
      subject: `Invoice ${number}`,
      body: defaultInvoiceBody(invoice, org?.org_name || invoice.bill_to_name),
    }));
  }

  async function handleSendCompose(e) {
    e.preventDefault();
    if (!compose.to.trim() || !compose.subject.trim() || !compose.body.trim()) {
      notifyError("To, subject, and body are required.");
      return;
    }
    setSending(true);
    try {
      const res = await apiRequest("/admin/platform-mail/messages", {
        method: "POST",
        body: {
          to: compose.to.trim(),
          subject: compose.subject.trim(),
          body: compose.body.trim(),
          organization_id: compose.organization_id ? Number(compose.organization_id) : null,
          invoice_id: compose.invoice_id ? Number(compose.invoice_id) : null,
          account_id: accountId || undefined,
          draft_id: compose.draft_id ? Number(compose.draft_id) : null,
        },
      });
      notifySuccess(res.message ?? "Email sent.");
      setCompose(emptyCompose());
      setOrgInvoices([]);
      setSelectedTemplateId("");
      setComposing(false);
      setFolder("sent");
      if (res.data?.id) {
        await openMessage(res.data.id);
      } else {
        await loadList({ append: false, offset: 0 });
      }
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to send email.");
    } finally {
      setSending(false);
    }
  }

  async function handleSaveDraft() {
    if (!compose.to.trim() && !compose.subject.trim() && !compose.body.trim()) {
      notifyError("Write a recipient, subject, or body before saving a draft.");
      return;
    }
    setSavingDraft(true);
    try {
      const res = await apiRequest("/admin/platform-mail/drafts", {
        method: "POST",
        body: {
          id: compose.draft_id ? Number(compose.draft_id) : undefined,
          to: compose.to.trim() || null,
          subject: compose.subject.trim() || null,
          body: compose.body,
          organization_id: compose.organization_id ? Number(compose.organization_id) : null,
          invoice_id: compose.invoice_id ? Number(compose.invoice_id) : null,
          account_id: accountId || undefined,
        },
      });
      const draft = res.data;
      if (draft?.id) {
        setCompose((prev) => ({ ...prev, draft_id: String(draft.id) }));
      }
      notifySuccess(res.message ?? "Draft saved.");
      if (folder !== "drafts") setFolder("drafts");
      else await loadList({ append: false, offset: 0 });
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to save draft.");
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleDeleteMessage(messageId, event) {
    event?.stopPropagation?.();
    event?.preventDefault?.();
    if (!messageId) return;
    const target = messages.find((row) => row.id === messageId);
    const ok = await confirm({
      title: "Delete message",
      message:
        target?.direction === "inbound"
          ? "Delete this message from Centrix and from the email account inbox?"
          : "Delete this message permanently?",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setDeletingId(messageId);
    try {
      const res = await apiRequest(`/admin/platform-mail/messages/${messageId}`, {
        method: "DELETE",
        loading: false,
      });
      notifySuccess(
        res.remote_deleted
          ? "Message deleted from mailbox and email account."
          : (res.message ?? "Message deleted."),
      );
      const removedUnread = target?.folder === "inbox" && !target?.read_at;
      setMessages((prev) => prev.filter((row) => row.id !== messageId));
      setListTotal((prev) => Math.max(0, prev - 1));
      if (typeof res.unread_count === "number") {
        setUnreadCount(res.unread_count);
        publishPlatformMailUnread(res.unread_count);
      } else if (removedUnread) {
        setUnreadCount((prev) => {
          const next = Math.max(0, prev - 1);
          publishPlatformMailUnread(next);
          return next;
        });
      }
      if (compose.draft_id && String(compose.draft_id) === String(messageId)) {
        setCompose(emptyCompose());
        setComposing(false);
      }
      if (selectedId === messageId) {
        setSelectedId(null);
        setSelected(null);
        setSimilarReplies([]);
      }
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to delete message.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleReply(e) {
    e.preventDefault();
    if (!selectedId || !replyBody.trim()) return;
    setSending(true);
    try {
      const res = await apiRequest(`/admin/platform-mail/messages/${selectedId}/reply`, {
        method: "POST",
        body: {
          body: replyBody.trim(),
          save_for_ai: saveReplyForAi,
        },
      });
      notifySuccess(res.message ?? "Reply sent.");
      setReplyBody("");
      setSaveReplyForAi(false);
      if (res.data?.id) {
        await openMessage(res.data.id);
      }
      setFolder("sent");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to send reply.");
    } finally {
      setSending(false);
    }
  }

  async function loadSimilarRepliesForSelected() {
    if (!selectedId) return [];
    try {
      const mem = await apiRequest(`/admin/platform-mail/messages/${selectedId}/similar-replies`, {
        loading: false,
      });
      const rows = Array.isArray(mem.data) ? mem.data : [];
      setSimilarReplies(rows);
      return rows;
    } catch (err) {
      setSimilarReplies([]);
      notifyError(err instanceof ApiError ? err.message : "Could not load similar saved responses.");
      return [];
    }
  }

  async function handleSaveForFutureFromReply() {
    const outboundInThread =
      selected?.direction === "inbound"
        ? [...thread].reverse().find((item) => item.direction === "outbound" && canSaveAsReplyMemory(item))
        : null;
    if (outboundInThread) {
      await handleToggleReplyMemory(outboundInThread, selected?.id);
      return;
    }
    setSaveReplyForAi((prev) => {
      const next = !prev;
      notifySuccess(
        next
          ? "This reply will be saved for future similar responses when you send it (kept up to 3 months)."
          : "This reply will not be saved for AI.",
      );
      return next;
    });
  }

  async function handleToggleReplyMemory(message, inboundMessageId = null) {
    if (!message?.id) return;
    const currentlySaved = isSavedForAi(message);
    setSavingReplyMemory(true);
    try {
      if (currentlySaved) {
        const res = await apiRequest(`/admin/platform-mail/messages/${message.id}/reply-memory`, {
          method: "DELETE",
          loading: false,
        });
        const next =
          res.data ?? {
            ...message,
            meta: { ...(message.meta || {}), reply_memory: { use_for_ai: false } },
          };
        setSelected((prev) => (prev?.id === message.id ? next : prev));
        setThread((prev) => prev.map((row) => (row.id === message.id ? { ...row, meta: next.meta } : row)));
        setMessages((prev) => prev.map((row) => (row.id === message.id ? { ...row, meta: next.meta } : row)));
        notifySuccess(res.message ?? "Removed from future AI responses.");
      } else {
        const res = await apiRequest(`/admin/platform-mail/messages/${message.id}/save-reply-memory`, {
          method: "POST",
          body: inboundMessageId ? { inbound_message_id: inboundMessageId } : {},
          loading: false,
        });
        const next = res.data ?? message;
        setSelected((prev) => (prev?.id === message.id ? next : prev));
        setThread((prev) => prev.map((row) => (row.id === message.id ? { ...row, meta: next.meta } : row)));
        setMessages((prev) => prev.map((row) => (row.id === message.id ? { ...row, meta: next.meta } : row)));
        notifySuccess(res.message ?? "Saved for future similar responses (up to 3 months).");
      }
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not update saved response.");
    } finally {
      setSavingReplyMemory(false);
    }
  }

  function openSaveTemplate() {
    const suggested =
      compose.subject.trim().slice(0, 80) ||
      (composeTemplates.length ? `Email template ${composeTemplates.length + 1}` : "Client email");
    setTemplateName(suggested);
    setTemplateSaveAsUpdate(false);
    setSaveTemplateOpen(true);
  }

  function openUpdateTemplate() {
    const tpl = composeTemplates.find((row) => String(row.id) === String(selectedTemplateId));
    setTemplateName(tpl?.name || compose.subject.trim().slice(0, 80) || "Email template");
    setTemplateSaveAsUpdate(true);
    setSaveTemplateOpen(true);
  }

  async function handleSaveTemplate() {
    if (!templateName.trim()) {
      notifyError("Enter a template name.");
      return;
    }
    if (!compose.subject.trim() && !compose.body.trim()) {
      notifyError("Write a subject or body before saving a template.");
      return;
    }
    setSavingTemplate(true);
    try {
      const updating = templateSaveAsUpdate && selectedTemplateId;
      const res = await apiRequest("/admin/platform-mail/compose-templates", {
        method: "POST",
        body: {
          ...(updating ? { id: selectedTemplateId } : {}),
          name: templateName.trim(),
          subject: compose.subject.trim(),
          body: compose.body,
        },
      });
      setComposeTemplates(Array.isArray(res.data) ? res.data : []);
      const saved =
        (res.data || []).find((row) => row.name === templateName.trim()) ||
        (updating
          ? (res.data || []).find((row) => String(row.id) === String(selectedTemplateId))
          : null);
      if (saved?.id) setSelectedTemplateId(saved.id);
      setSaveTemplateOpen(false);
      notifySuccess(updating ? "Email template updated." : "Email template saved.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save template.");
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleDeleteTemplate(templateId) {
    if (!templateId) return;
    const tpl = composeTemplates.find((row) => String(row.id) === String(templateId));
    const ok = await confirm({
      title: "Delete email template",
      message: `Delete “${tpl?.name || "this template"}”?`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      const res = await apiRequest(`/admin/platform-mail/compose-templates/${encodeURIComponent(templateId)}`, {
        method: "DELETE",
      });
      setComposeTemplates(Array.isArray(res.data) ? res.data : []);
      if (String(selectedTemplateId) === String(templateId)) setSelectedTemplateId("");
      notifySuccess("Template deleted.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not delete template.");
    }
  }

  function applyTemplateLiterally(templateId) {
    const tpl = composeTemplates.find((row) => String(row.id) === String(templateId));
    if (!tpl) return;
    setSelectedTemplateId(tpl.id);
    setCompose((prev) => ({
      ...prev,
      subject: tpl.subject || prev.subject,
      body: tpl.body || prev.body,
    }));
    notifySuccess(`Loaded template “${tpl.name}”. Adjust details or use Draft from template.`);
  }

  const draftContext = (() => {
    const org = organizations.find((row) => String(row.id) === String(compose.organization_id));
    const invoice = orgInvoices.find((row) => String(row.id) === String(compose.invoice_id));
    return {
      organization_name: org?.org_name || "",
      company_code: org?.company_code || "",
      to_email: compose.to || org?.org_email || "",
      invoice_number: invoice?.invoice_number || "",
      invoice_total: invoice?.total != null ? String(invoice.total) : "",
      invoice_currency: invoice?.currency || "",
    };
  })();

  const selectedSavedForAi = isSavedForAi(selected);
  const selectedCanSaveMemory = canSaveAsReplyMemory(selected);
  const threadOutboundReply =
    selected?.direction === "inbound"
      ? [...thread].reverse().find((item) => item.direction === "outbound" && canSaveAsReplyMemory(item))
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <button
            type="button"
            className="flex max-w-[16rem] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
            onClick={() => setAccountMenuOpen((open) => !open)}
            aria-haspopup="listbox"
            aria-expanded={accountMenuOpen}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#185FA5] text-xs font-semibold text-white">
              {mailboxAccountLabel(activeAccount).slice(0, 1).toUpperCase() || "M"}
            </span>
            <span className="min-w-0 truncate">{mailboxAccountLabel(activeAccount)}</span>
            <span className="text-slate-400" aria-hidden>
              ▾
            </span>
          </button>
          {accountMenuOpen ? (
            <div className="absolute left-0 z-30 mt-1 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
              <p className="border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Switch mailbox
              </p>
              <ul role="listbox" className="max-h-64 overflow-auto py-1">
                {(accounts.length ? accounts : [{ id: accountId || "default", label: "Primary", from_address: "" }]).map(
                  (account) => {
                    const selectedAccount = String(account.id) === String(accountId || activeAccount?.id);
                    return (
                      <li key={account.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selectedAccount}
                          className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                            selectedAccount ? "bg-slate-50" : ""
                          }`}
                          onClick={() => selectAccount(account.id)}
                        >
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
                            {mailboxAccountLabel(account).slice(0, 1).toUpperCase()}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-slate-900">
                              {mailboxAccountLabel(account)}
                            </span>
                            <span className="block truncate text-xs text-slate-500">
                              {account.from_address || account.smtp_username || "Configure in settings"}
                              {account.is_default ? " · default" : ""}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  },
                )}
              </ul>
              <a
                href="/platform/settings?tab=email&email_tab=smtp"
                className="block border-t px-3 py-2 text-sm font-medium text-[#185FA5] hover:bg-slate-50"
              >
                Manage mailboxes…
              </a>
            </div>
          ) : null}
        </div>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
          {[
            { id: "inbox", label: unreadCount ? `Inbox (${unreadCount})` : "Inbox" },
            { id: "drafts", label: "Drafts" },
            { id: "sent", label: "Sent" },
            { id: "all", label: "All" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                folder === tab.id ? "bg-white text-[#185FA5] shadow-sm" : "text-slate-600"
              }`}
              onClick={() => {
                setFolder(tab.id);
                setKindFilter("");
                setSelectedId(null);
                setSelected(null);
                setComposing(false);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {folder === "sent" ? (
          <select
            className={`${inputClass} max-w-[14rem]`}
            value={kindFilter}
            onChange={(e) => {
              setKindFilter(e.target.value);
              setSelectedId(null);
              setSelected(null);
            }}
          >
            <option value="">All sent types</option>
            <option value="subscription_renewal_reminder">
              Renewal reminders
              {mailStats?.renewal_reminders?.all_time != null
                ? ` (${mailStats.renewal_reminders.all_time})`
                : ""}
            </option>
            <option value="two_factor">
              2FA codes
              {mailStats?.two_factor?.all_time != null ? ` (${mailStats.two_factor.all_time})` : ""}
            </option>
            <option value="email_verification">
              Email verification
              {mailStats?.email_verification?.all_time != null
                ? ` (${mailStats.email_verification.all_time})`
                : ""}
            </option>
            <option value="subscription_renewal_reminder_test">Renewal tests</option>
            <option value="test">SMTP tests</option>
          </select>
        ) : null}
        <div className="relative min-w-[12rem] flex-1 max-w-md">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
          </span>
          <input
            className={`${inputClass} pl-9`}
            placeholder="Search mail in this mailbox…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search mailbox"
          />
        </div>
        <button type="button" className={SECONDARY_BTN_CLASS} disabled={syncing} onClick={() => void handleSync()}>
          {syncing ? "Syncing…" : "Sync inbox"}
        </button>
        <PrimaryButton
          type="button"
          showIcon={false}
          onClick={() => {
            setCompose(emptyCompose());
            setOrgInvoices([]);
            setComposing(true);
            setSelectedId(null);
            setSelected(null);
          }}
        >
          Compose
        </PrimaryButton>
      </div>

      <p className="text-xs text-slate-500">
        Synced inbox mail is stored as metadata + short snippets; the full body loads from IMAP when you
        open a message. Local copies (including saved AI responses) are auto-deleted after 3 months.
        Outbound mail you send from Centrix is kept the same way. Use Sync inbox anytime to pull the
        latest client replies.
      </p>

      {folder === "sent" && mailStats ? (
        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          <span className="rounded-full bg-slate-100 px-2.5 py-1">
            Renewals: <strong>{mailStats.renewal_reminders?.all_time ?? 0}</strong>
            <span className="text-slate-400"> · {mailStats.renewal_reminders?.last_30_days ?? 0} / 30d</span>
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1">
            2FA: <strong>{mailStats.two_factor?.all_time ?? 0}</strong>
            <span className="text-slate-400"> · {mailStats.two_factor?.last_30_days ?? 0} / 30d</span>
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1">
            Verification: <strong>{mailStats.email_verification?.all_time ?? 0}</strong>
          </span>
        </div>
      ) : null}

      <div className="grid min-h-[28rem] gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div className="theme-panel overflow-hidden rounded-xl border shadow-sm">
          {loading ? (
            <p className="p-4 text-sm text-slate-500">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">
              {search ? "No messages match your search." : "No messages in this folder."}
            </p>
          ) : (
            <>
              <ul className="divide-y divide-slate-100">
                {messages.map((msg) => {
                  const unread = msg.folder === "inbox" && !msg.read_at;
                  const active = selectedId === msg.id;
                  return (
                    <li key={msg.id} className="group relative">
                      <button
                        type="button"
                        className={`w-full px-3 py-3 pr-10 text-left hover:bg-slate-50 ${
                          active ? "bg-sky-50" : ""
                        }`}
                        onClick={() => void openMessage(msg.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2">
                            {unread ? (
                              <span
                                className="h-2 w-2 shrink-0 rounded-full bg-[#185FA5]"
                                title="Unread"
                                aria-label="Unread"
                              />
                            ) : (
                              <span className="h-2 w-2 shrink-0" aria-hidden />
                            )}
                            <span
                              className={`truncate text-sm ${
                                unread ? "font-semibold text-slate-900" : "text-slate-800"
                              }`}
                            >
                              {msg.direction === "outbound"
                                ? (Array.isArray(msg.to_addresses) ? msg.to_addresses[0] : "—")
                                : msg.from_name || msg.from_address}
                            </span>
                          </span>
                          <span className="shrink-0 text-[10px] text-slate-400">
                            {formatWhen(msg.sent_at || msg.received_at)}
                          </span>
                        </div>
                        <div
                          className={`mt-0.5 truncate pl-4 text-xs ${
                            unread ? "font-medium text-slate-800" : "text-slate-600"
                          }`}
                        >
                          {msg.kind_label ? (
                            <span className="mr-1 inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                              {msg.kind_label}
                            </span>
                          ) : null}
                          {msg.subject || "(no subject)"}
                        </div>
                        <div className="mt-0.5 truncate pl-4 text-[11px] text-slate-400">
                          {previewBody(msg.body_text)}
                        </div>
                      </button>
                      <button
                        type="button"
                        className="absolute right-2 top-2 z-10 rounded-md p-1.5 text-red-600 opacity-0 transition hover:bg-red-50 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:opacity-40"
                        title="Delete"
                        aria-label="Delete message"
                        disabled={deletingId === msg.id}
                        onClick={(e) => void handleDeleteMessage(msg.id, e)}
                      >
                        <TrashIcon />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {hasMore ? (
                <div className="border-t border-slate-100 p-3">
                  <button
                    type="button"
                    className={`${SECONDARY_BTN_CLASS} w-full justify-center`}
                    disabled={loadingMore}
                    onClick={() => void loadList({ append: true, offset: messages.length })}
                  >
                    {loadingMore
                      ? "Loading…"
                      : `Show more (${Math.min(PAGE_SIZE, Math.max(0, listTotal - messages.length))} of ${Math.max(0, listTotal - messages.length)} left)`}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="theme-panel rounded-xl border p-5 shadow-sm">
          {composing ? (
            <form onSubmit={(e) => void handleSendCompose(e)} className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-900">
                {compose.draft_id ? "Edit draft" : "New email to client"}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Organization</span>
                  <select
                    className={inputClass}
                    value={compose.organization_id}
                    onChange={(e) => applyOrganization(e.target.value)}
                  >
                    <option value="">— Optional —</option>
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.org_name}
                        {org.company_code ? ` (${org.company_code})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">
                    Invoice to attach
                  </span>
                  <select
                    className={inputClass}
                    value={compose.invoice_id}
                    disabled={!compose.organization_id || loadingOrgInvoices}
                    onChange={(e) => applyInvoice(e.target.value)}
                  >
                    <option value="">
                      {!compose.organization_id
                        ? "Select organization first"
                        : loadingOrgInvoices
                          ? "Loading invoices…"
                          : orgInvoices.length === 0
                            ? "No invoices for this org"
                            : "— None —"}
                    </option>
                    {orgInvoices.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {invoiceOptionLabel(inv)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {compose.invoice_id ? (
                <p className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                  Selected invoice will be attached as a PDF when you send.
                </p>
              ) : null}
              <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <label className="min-w-[12rem] flex-1 block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Load saved template</span>
                  <select
                    className={inputClass}
                    value={selectedTemplateId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedTemplateId(id);
                      if (id) applyTemplateLiterally(id);
                    }}
                  >
                    <option value="">— Select template —</option>
                    {composeTemplates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={SECONDARY_BTN_CLASS}
                  disabled={!compose.subject.trim() && !compose.body.trim()}
                  onClick={openSaveTemplate}
                >
                  Save as template
                </button>
                {selectedTemplateId ? (
                  <>
                    <button
                      type="button"
                      className={SECONDARY_BTN_CLASS}
                      disabled={!compose.subject.trim() && !compose.body.trim()}
                      onClick={openUpdateTemplate}
                    >
                      Update template
                    </button>
                    <button
                      type="button"
                      className={SECONDARY_BTN_CLASS}
                      onClick={() => void handleDeleteTemplate(selectedTemplateId)}
                    >
                      Delete template
                    </button>
                  </>
                ) : null}
              </div>
              <PlatformAiEmailAssist
                subject={compose.subject}
                body={compose.body}
                templates={composeTemplates}
                selectedTemplateId={selectedTemplateId}
                onSelectedTemplateIdChange={setSelectedTemplateId}
                draftContext={draftContext}
                onApply={({ subject, body }) => setCompose((c) => ({ ...c, subject, body }))}
              />
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">To</span>
                <input
                  type="email"
                  className={inputClass}
                  value={compose.to}
                  onChange={(e) => setCompose((c) => ({ ...c, to: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Subject</span>
                <input
                  className={inputClass}
                  value={compose.subject}
                  onChange={(e) => setCompose((c) => ({ ...c, subject: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Body</span>
                <textarea
                  className={inputClass}
                  rows={12}
                  value={compose.body}
                  onChange={(e) => setCompose((c) => ({ ...c, body: e.target.value }))}
                />
              </label>
              <div className="flex flex-wrap justify-end gap-2">
                {compose.draft_id ? (
                  <button
                    type="button"
                    className={deleteBtnClass}
                    onClick={() => void handleDeleteMessage(Number(compose.draft_id))}
                  >
                    <TrashIcon />
                    Delete draft
                  </button>
                ) : null}
                <button
                  type="button"
                  className={SECONDARY_BTN_CLASS}
                  onClick={() => {
                    setComposing(false);
                    setCompose(emptyCompose());
                    setOrgInvoices([]);
                    setSelectedTemplateId("");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={SECONDARY_BTN_CLASS}
                  disabled={savingDraft}
                  onClick={() => void handleSaveDraft()}
                >
                  {savingDraft ? "Saving…" : compose.draft_id ? "Update draft" : "Save draft"}
                </button>
                <PrimaryButton type="submit" showIcon={false} disabled={sending}>
                  {sending ? "Sending…" : compose.invoice_id ? "Send with invoice" : "Send"}
                </PrimaryButton>
              </div>
            </form>
          ) : !selected ? (
            <p className="text-sm text-slate-500">Select a message or compose a new email to a client.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{selected.subject || "(no subject)"}</h2>
                  {selected.kind_label || selected.meta?.kind ? (
                    <p className="mt-1">
                      <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        {selected.kind_label || selected.meta?.kind}
                      </span>
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-slate-500">
                    {selected.direction === "outbound" ? "To" : "From"}{" "}
                    {selected.direction === "outbound"
                      ? (Array.isArray(selected.to_addresses) ? selected.to_addresses.join(", ") : "—")
                      : `${selected.from_name ? `${selected.from_name} ` : ""}<${selected.from_address}>`}{" "}
                    · {formatWhen(selected.sent_at || selected.received_at)}
                  </p>
                  {selected.meta?.invoice_id ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Invoice attached · ID {selected.meta.invoice_id}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedCanSaveMemory ? (
                    <button
                      type="button"
                      className={
                        selectedSavedForAi
                          ? "inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 shadow-sm hover:bg-emerald-100 disabled:opacity-60"
                          : "inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-800 shadow-sm hover:bg-sky-100 disabled:opacity-60"
                      }
                      disabled={savingReplyMemory}
                      onClick={() => void handleToggleReplyMemory(selected)}
                      title={
                        selectedSavedForAi
                          ? "Stop using this reply for similar future emails"
                          : "Save this response for future similar emails (kept up to 3 months)"
                      }
                    >
                      {savingReplyMemory
                        ? "Saving…"
                        : selectedSavedForAi
                          ? "Saved for future response · Remove"
                          : "Save response for future response"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={deleteBtnClass}
                    disabled={deletingId === selected.id}
                    onClick={() => void handleDeleteMessage(selected.id)}
                  >
                    <TrashIcon />
                    {deletingId === selected.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>

              {thread.length > 1 ? (
                <div className="space-y-3 border-t border-slate-100 pt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Thread</p>
                  {thread.map((item) => (
                    <div key={item.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      <div className="text-[11px] text-slate-400">
                        {item.direction === "outbound" ? "You" : item.from_address} ·{" "}
                        {formatWhen(item.sent_at || item.received_at)}
                      </div>
                      <pre className="mt-1 whitespace-pre-wrap font-sans text-sm">{item.body_text}</pre>
                    </div>
                  ))}
                </div>
              ) : (
                <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 font-sans text-sm text-slate-800">
                  {selected.body_text}
                </pre>
              )}

              {selected.direction === "inbound" || selected.folder === "inbox" ? (
                <form onSubmit={(e) => void handleReply(e)} className="space-y-3 border-t border-slate-100 pt-4">
                  <h3 className="text-sm font-semibold text-slate-900">Reply</h3>
                  {selected.body_from_imap ? (
                    <p className="text-[11px] text-slate-400">Full message loaded from IMAP.</p>
                  ) : selected.body_is_snippet ? (
                    <p className="text-[11px] text-amber-700">
                      Showing local snippet only — IMAP full body was unavailable.
                    </p>
                  ) : null}
                  <PlatformAiEmailAssist
                    variant="reply"
                    subject={selected.subject?.startsWith("Re:") ? selected.subject : `Re: ${selected.subject || ""}`}
                    body={replyBody}
                    inboundEmail={{
                      subject: selected.subject || "",
                      from_address: selected.from_address || "",
                      from_name: selected.from_name || "",
                      body_text: selected.body_text || "",
                    }}
                    similarReplies={similarReplies}
                    onCheckSimilar={loadSimilarRepliesForSelected}
                    onSaveForFuture={handleSaveForFutureFromReply}
                    savedForFuture={saveReplyForAi || isSavedForAi(threadOutboundReply)}
                    savingForFuture={savingReplyMemory}
                    onApply={({ body }) => setReplyBody(body)}
                  />
                  <textarea
                    className={inputClass}
                    rows={6}
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Write your reply…"
                    required
                  />
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      className={deleteBtnClass}
                      disabled={deletingId === selected.id}
                      onClick={() => void handleDeleteMessage(selected.id)}
                    >
                      <TrashIcon />
                      Delete
                    </button>
                    <PrimaryButton type="submit" showIcon={false} disabled={sending || !replyBody.trim()}>
                      {sending
                        ? "Sending…"
                        : saveReplyForAi
                          ? "Send & save for future response"
                          : "Send reply"}
                    </PrimaryButton>
                  </div>
                </form>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {saveTemplateOpen ? (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="theme-modal w-full max-w-md rounded-xl border p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-900">
              {templateSaveAsUpdate ? "Update email template" : "Save email template"}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {templateSaveAsUpdate
                ? "Overwrite the selected template with the current subject and body."
                : "Reuse this subject and body later with “Draft from template” — AI will adapt the details."}
            </p>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Template name</span>
              <input
                className={inputClass}
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. Renewal follow-up"
                autoFocus
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className={SECONDARY_BTN_CLASS}
                onClick={() => setSaveTemplateOpen(false)}
                disabled={savingTemplate}
              >
                Cancel
              </button>
              <PrimaryButton
                type="button"
                showIcon={false}
                disabled={savingTemplate || !templateName.trim()}
                onClick={() => void handleSaveTemplate()}
              >
                {savingTemplate
                  ? "Saving…"
                  : templateSaveAsUpdate
                    ? "Update template"
                    : "Save template"}
              </PrimaryButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
