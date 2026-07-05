"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { useAuth } from "@/contexts/auth-context";
import { isPlatformWhatsappEnabled } from "@/lib/platform-org-features";
import { notifyError, notifySuccess } from "@/lib/notify";

const TABS = [
  { id: "conversations", label: "Conversations" },
  { id: "handoffs", label: "Help requests" },
  { id: "failures", label: "Failed orders" },
];

function formatWhen(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function WhatsappAdminScreen() {
  const { capabilities } = useAuth();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState("conversations");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [handoffs, setHandoffs] = useState([]);
  const [failures, setFailures] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const enabled = isPlatformWhatsappEnabled(capabilities);

  const loadList = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const [convRes, handoffRes, failRes] = await Promise.all([
        apiRequest("/erp/whatsapp/conversations", { searchParams: { per_page: 50 } }),
        apiRequest("/erp/whatsapp/handoffs", { searchParams: { per_page: 50 } }),
        apiRequest("/erp/whatsapp/failures", { searchParams: { per_page: 50 } }),
      ]);
      setConversations(Array.isArray(convRes?.data) ? convRes.data : []);
      setHandoffs(Array.isArray(handoffRes?.data) ? handoffRes.data : []);
      setFailures(Array.isArray(failRes?.data) ? failRes.data : []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load WhatsApp activity.");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const loadConversation = useCallback(async (id) => {
    setDetailLoading(true);
    try {
      const res = await apiRequest(`/erp/whatsapp/conversations/${id}`);
      setSelectedConversation(res.conversation ?? null);
      setMessages(Array.isArray(res.messages) ? res.messages : []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load conversation.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    const handoffId = searchParams.get("handoff");
    const conversationId = searchParams.get("conversation");
    if (conversationId) {
      setTab("conversations");
      void loadConversation(Number(conversationId));
      return;
    }
    if (handoffId) {
      setTab("handoffs");
    }
  }, [searchParams, loadConversation]);

  async function resolveHandoff(id) {
    try {
      await apiRequest(`/erp/whatsapp/handoffs/${id}/resolve`, { method: "POST" });
      notifySuccess("Help request marked resolved.");
      await loadList();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not resolve help request.");
    }
  }

  const openHandoffs = useMemo(() => handoffs.filter((h) => h.status === "open"), [handoffs]);

  if (!enabled) {
    return (
      <CatalogPageShell title="WhatsApp" subtitle="Customer WhatsApp ordering is not enabled for this organization.">
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          Ask your platform administrator to enable WhatsApp ordering for this tenant.
        </p>
      </CatalogPageShell>
    );
  }

  return (
    <CatalogPageShell
      title="WhatsApp"
      subtitle="Customer conversations, help requests from chat, and failed order attempts."
    >
      <AdminBreadcrumb items={[{ label: "Sales", href: "/sales/orders" }, { label: "WhatsApp" }]} />

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === item.id ? "bg-[#185FA5] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {item.label}
            {item.id === "handoffs" && openHandoffs.length > 0 ? ` (${openHandoffs.length})` : ""}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}

      {!loading && tab === "conversations" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="theme-panel overflow-hidden rounded-xl border shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2">Phone</th>
                  <th className="px-4 py-2">State</th>
                  <th className="px-4 py-2">Last message</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {conversations.map((row) => (
                  <tr
                    key={row.id}
                    className={`cursor-pointer hover:bg-slate-50 ${selectedConversation?.id === row.id ? "bg-[#E6F1FB]" : ""}`}
                    onClick={() => void loadConversation(row.id)}
                  >
                    <td className="px-4 py-2">{row.customer?.customer_name ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs">{row.phone}</td>
                    <td className="px-4 py-2">{row.state}</td>
                    <td className="px-4 py-2 text-slate-600">{formatWhen(row.last_message_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {conversations.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">No conversations yet.</p>
            ) : null}
          </div>

          <div className="theme-panel rounded-xl border p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">Message log</h3>
            {detailLoading ? <p className="mt-3 text-sm text-slate-500">Loading…</p> : null}
            {!detailLoading && !selectedConversation ? (
              <p className="mt-3 text-sm text-slate-500">Select a conversation to view messages.</p>
            ) : null}
            {!detailLoading && selectedConversation ? (
              <div className="mt-3 max-h-[32rem] space-y-2 overflow-y-auto">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-lg px-3 py-2 text-xs ${
                      msg.direction === "in"
                        ? "bg-slate-100 text-slate-800"
                        : msg.direction === "system"
                          ? "bg-red-50 text-red-800"
                          : "bg-[#E6F1FB] text-slate-800"
                    }`}
                  >
                    <div className="mb-1 font-medium uppercase tracking-wide opacity-70">{msg.direction}</div>
                    <div className="whitespace-pre-wrap">{msg.body}</div>
                    <div className="mt-1 text-[10px] opacity-60">{formatWhen(msg.created_at)}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {!loading && tab === "handoffs" ? (
        <div className="theme-panel overflow-hidden rounded-xl border shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">Phone</th>
                <th className="px-4 py-2">Message</th>
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {handoffs.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2">{row.customer?.customer_name ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs">{row.phone}</td>
                  <td className="px-4 py-2 text-slate-600">{row.customer_message ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{formatWhen(row.created_at)}</td>
                  <td className="px-4 py-2 text-right">
                    {row.status === "open" ? (
                      <button
                        type="button"
                        className="text-sm font-medium text-[#185FA5] hover:underline"
                        onClick={() => void resolveHandoff(row.id)}
                      >
                        Mark resolved
                      </button>
                    ) : (
                      <span className="text-xs text-emerald-700">Resolved</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {handoffs.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">No help requests.</p>
          ) : null}
        </div>
      ) : null}

      {!loading && tab === "failures" ? (
        <div className="theme-panel overflow-hidden rounded-xl border shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Phone</th>
                <th className="px-4 py-2">Error</th>
                <th className="px-4 py-2">When</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {failures.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2 font-mono text-xs">{row.from_phone ?? "—"}</td>
                  <td className="px-4 py-2 text-red-800">{row.body ?? row.meta?.error ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{formatWhen(row.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {failures.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">No failed order attempts logged.</p>
          ) : null}
        </div>
      ) : null}
    </CatalogPageShell>
  );
}
