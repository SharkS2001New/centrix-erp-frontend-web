"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { PrimaryButton, SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";
import { PlatformAiEmailAssist } from "@/components/platform/platform-ai-email-assist";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

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

export function PlatformMailboxPanel() {
  const [folder, setFolder] = useState("inbox");
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
  const [compose, setCompose] = useState({ to: "", subject: "", body: "" });
  const [search, setSearch] = useState("");

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/platform-mail/messages", {
        searchParams: { folder, ...(search.trim() ? { q: search.trim() } : {}) },
      });
      setMessages(Array.isArray(res.data) ? res.data : []);
      setUnreadCount(Number(res.unread_count || 0));
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load mailbox.");
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [folder, search]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

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
        },
      });
      notifySuccess(res.message ?? "Email sent.");
      setCompose({ to: "", subject: "", body: "" });
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
                setSelectedId(null);
                setSelected(null);
                setComposing(false);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
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
            setComposing(true);
            setSelectedId(null);
            setSelected(null);
          }}
        >
          Compose
        </PrimaryButton>
      </div>

      <p className="text-xs text-slate-500">
        Sent mail is stored here automatically. Configure IMAP under Email delivery, then use Sync inbox to pull
        client replies into one place.
      </p>

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
                <button type="button" className={SECONDARY_BTN_CLASS} onClick={() => setComposing(false)}>
                  Cancel
                </button>
                <PrimaryButton type="submit" showIcon={false} disabled={sending}>
                  {sending ? "Sending…" : "Send"}
                </PrimaryButton>
              </div>
            </form>
          ) : !selected ? (
            <p className="text-sm text-slate-500">Select a message or compose a new email to a client.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">{selected.subject || "(no subject)"}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {selected.direction === "outbound" ? "To" : "From"}{" "}
                  {selected.direction === "outbound"
                    ? (Array.isArray(selected.to_addresses) ? selected.to_addresses.join(", ") : "—")
                    : `${selected.from_name ? `${selected.from_name} ` : ""}<${selected.from_address}>`}{" "}
                  · {formatWhen(selected.sent_at || selected.received_at)}
                </p>
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
