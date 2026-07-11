"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { PrimaryButton, SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";
import { PlatformAiEmailAssist } from "@/components/platform/platform-ai-email-assist";
import { formatBillingMoney } from "@/lib/platform-billing";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

function emptyCompose() {
  return {
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

export function PlatformMailboxPanel() {
  const [folder, setFolder] = useState("inbox");
  const [kindFilter, setKindFilter] = useState("");
  const [mailStats, setMailStats] = useState(null);
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [thread, setThread] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [composing, setComposing] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [compose, setCompose] = useState(() => emptyCompose());
  const [search, setSearch] = useState("");
  const [organizations, setOrganizations] = useState([]);
  const [orgInvoices, setOrgInvoices] = useState([]);
  const [loadingOrgInvoices, setLoadingOrgInvoices] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/platform-mail/messages", {
        searchParams: {
          folder,
          ...(search.trim() ? { q: search.trim() } : {}),
          ...(folder === "sent" && kindFilter ? { kind: kindFilter } : {}),
        },
      });
      setMessages(Array.isArray(res.data) ? res.data : []);
      setUnreadCount(Number(res.unread_count || 0));
      if (res.stats) setMailStats(res.stats);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load mailbox.");
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [folder, search, kindFilter]);

  const loadOrganizations = useCallback(async () => {
    try {
      const res = await apiRequest("/admin/organizations", { loading: false });
      setOrganizations(res.data ?? []);
    } catch {
      setOrganizations([]);
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
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (composing) void loadOrganizations();
  }, [composing, loadOrganizations]);

  useEffect(() => {
    if (composing) void loadOrgInvoices(compose.organization_id);
  }, [composing, compose.organization_id, loadOrgInvoices]);

  async function openMessage(id) {
    setComposing(false);
    setSelectedId(id);
    setReplyBody("");
    try {
      const res = await apiRequest(`/admin/platform-mail/messages/${id}`);
      setSelected(res.data ?? null);
      setThread(Array.isArray(res.thread) ? res.thread : []);
      void loadList();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to open message.");
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await apiRequest("/admin/platform-mail/sync", { method: "POST", body: {} });
      notifySuccess(res.message ?? "Inbox synced.");
      await loadList();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "IMAP sync failed.");
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
        },
      });
      notifySuccess(res.message ?? "Email sent.");
      setCompose(emptyCompose());
      setOrgInvoices([]);
      setComposing(false);
      setFolder("sent");
      if (res.data?.id) {
        await openMessage(res.data.id);
      } else {
        await loadList();
      }
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to send email.");
    } finally {
      setSending(false);
    }
  }

  async function handleReply(e) {
    e.preventDefault();
    if (!selectedId || !replyBody.trim()) return;
    setSending(true);
    try {
      const res = await apiRequest(`/admin/platform-mail/messages/${selectedId}/reply`, {
        method: "POST",
        body: { body: replyBody.trim() },
      });
      notifySuccess(res.message ?? "Reply sent.");
      setReplyBody("");
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
          {[
            { id: "inbox", label: unreadCount ? `Inbox (${unreadCount})` : "Inbox" },
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
        <input
          className={`${inputClass} max-w-xs`}
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
        Select an organization to prefill the recipient, or pick an invoice to attach as PDF. Outbound mail —
        including auto renewal reminders and 2FA codes — is stored under Sent. Configure IMAP under Email
        delivery, then use Sync inbox to pull client replies.
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
            <p className="p-4 text-sm text-slate-500">No messages in this folder.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {messages.map((msg) => {
                const unread = msg.folder === "inbox" && !msg.read_at;
                const active = selectedId === msg.id;
                return (
                  <li key={msg.id}>
                    <button
                      type="button"
                      className={`w-full px-3 py-3 text-left hover:bg-slate-50 ${
                        active ? "bg-sky-50" : ""
                      }`}
                      onClick={() => void openMessage(msg.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className={`truncate text-sm ${unread ? "font-semibold text-slate-900" : "text-slate-800"}`}>
                          {msg.direction === "outbound"
                            ? (Array.isArray(msg.to_addresses) ? msg.to_addresses[0] : "—")
                            : msg.from_name || msg.from_address}
                        </span>
                        <span className="shrink-0 text-[10px] text-slate-400">
                          {formatWhen(msg.sent_at || msg.received_at)}
                        </span>
                      </div>
                      <div className={`mt-0.5 truncate text-xs ${unread ? "font-medium text-slate-800" : "text-slate-600"}`}>
                        {msg.kind_label ? (
                          <span className="mr-1 inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                            {msg.kind_label}
                          </span>
                        ) : null}
                        {msg.subject || "(no subject)"}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-slate-400">{previewBody(msg.body_text)}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="theme-panel rounded-xl border p-5 shadow-sm">
          {composing ? (
            <form onSubmit={(e) => void handleSendCompose(e)} className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-900">New email to client</h2>
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
              <PlatformAiEmailAssist
                subject={compose.subject}
                body={compose.body}
                onApply={({ subject, body }) => setCompose((c) => ({ ...c, subject, body }))}
              />
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">To</span>
                <input
                  type="email"
                  className={inputClass}
                  value={compose.to}
                  onChange={(e) => setCompose((c) => ({ ...c, to: e.target.value }))}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Subject</span>
                <input
                  className={inputClass}
                  value={compose.subject}
                  onChange={(e) => setCompose((c) => ({ ...c, subject: e.target.value }))}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Body</span>
                <textarea
                  className={inputClass}
                  rows={12}
                  value={compose.body}
                  onChange={(e) => setCompose((c) => ({ ...c, body: e.target.value }))}
                  required
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className={SECONDARY_BTN_CLASS}
                  onClick={() => {
                    setComposing(false);
                    setCompose(emptyCompose());
                    setOrgInvoices([]);
                  }}
                >
                  Cancel
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

              <form onSubmit={(e) => void handleReply(e)} className="space-y-2 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-semibold text-slate-900">Reply</h3>
                <textarea
                  className={inputClass}
                  rows={6}
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Write your reply…"
                  required
                />
                <div className="flex justify-end">
                  <PrimaryButton type="submit" showIcon={false} disabled={sending || !replyBody.trim()}>
                    {sending ? "Sending…" : "Send reply"}
                  </PrimaryButton>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
