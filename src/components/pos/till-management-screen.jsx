"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import { useAuth } from "@/contexts/auth-context";
import { usePosSession } from "@/contexts/pos-session-context";
import { filterByOrganization, orgListParams } from "@/lib/admin";
import {
  CatalogPageShell,
  FilterSelect,
  IconButton,
  PaginationBar,
  PencilIcon,
  SearchInput,
  StatCard,
  TrashIcon,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
import { PosStatusBadge } from "@/components/pos/pos-shared";
import { ZReportModal, HandoverSessionModal } from "@/components/pos/pos-session-modals";
import {
  DeleteTillConfirmModal,
  EditSessionFloatDrawer,
  FloatBreakdownModal,
  FloatTotalLink,
  TillFormDrawer,
} from "@/components/pos/till-session-ui";
import {
  currentFloatAmount,
  formatSessionTime,
  formatTillKes,
  indexOpenSessionsByTill,
  normalizeFloatEntries,
  openingFloatAmount,
  tillCode,
  tillDisplayName,
  tillStatusLabel,
  tillStatusTone,
} from "@/lib/pos-till";
import { isPosTillFloatRequired } from "@/lib/sales-settings";

const TABS = [
  { id: "tills", label: "Tills" },
  { id: "history", label: "Session history" },
];

const HISTORY_PAGE_SIZE = 15;
const TILLS_PAGE_SIZE = 10;

function TabBar({ active, onChange }) {
  return (
    <div className="mb-6 flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            active === tab.id
              ? "bg-[#185FA5] text-white"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function EyeIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1 1 0 0 1 0-.644C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

function OpenPosIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}

function IconLink({ href, label, children }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="inline-flex rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
    >
      {children}
    </Link>
  );
}

function MoreIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="5" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="19" r="1.75" />
    </svg>
  );
}

function TillActionsMenu({ onEditTill, onCorrectFloat, onDelete, deleting }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuWidth = menuRef.current?.offsetWidth ?? 160;
    const menuHeight = menuRef.current?.offsetHeight ?? 88;
    const gap = 6;
    const padding = 8;

    let top = rect.bottom + gap;
    if (top + menuHeight > window.innerHeight - padding) {
      top = Math.max(padding, rect.top - menuHeight - gap);
    }

    let left = rect.right - menuWidth;
    left = Math.max(padding, Math.min(left, window.innerWidth - menuWidth - padding));

    setMenuStyle({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return undefined;

    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <>
            <button
              type="button"
              className="fixed inset-0 z-[200]"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            />
            <div
              ref={menuRef}
              className="fixed z-[210] min-w-[10.5rem] rounded-lg border border-slate-200 bg-white py-1 text-slate-900 shadow-xl"
              style={{ top: menuStyle.top, left: menuStyle.left }}
            >
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setOpen(false);
                  onEditTill();
                }}
              >
                Edit till
              </button>
              {onCorrectFloat ? (
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    setOpen(false);
                    onCorrectFloat();
                  }}
                >
                  Edit cashier float
                </button>
              ) : null}
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                disabled={deleting}
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
              >
                Delete till
              </button>
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <>
      <span ref={triggerRef} className="inline-flex">
        <IconButton label="More actions" onClick={() => setOpen((v) => !v)}>
          <MoreIcon />
        </IconButton>
      </span>
      {menu}
    </>
  );
}

export function TillManagementScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "history" ? "history" : "tills";

  const { user, capabilities } = useAuth();
  const { activeSession, clearSession } = usePosSession();

  const organizationId = user?.organization_id ?? capabilities?.organization_id;

  const [tab, setTab] = useState(initialTab);
  const [pageError, setPageError] = useState(null);

  // Shared meta
  const [tills, setTills] = useState([]);
  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [openSessions, setOpenSessions] = useState([]);
  const [sessionReports, setSessionReports] = useState(new Map());
  const [metaLoading, setMetaLoading] = useState(true);

  const [breakdownSession, setBreakdownSession] = useState(null);
  const [editingFloatSession, setEditingFloatSession] = useState(null);
  const [floatDrawerOpen, setFloatDrawerOpen] = useState(false);

  // Tills tab
  const [tillSearch, setTillSearch] = useState("");
  const [tillBranchFilter, setTillBranchFilter] = useState("");
  const [tillStatusFilter, setTillStatusFilter] = useState("");
  const [tillPage, setTillPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingTill, setEditingTill] = useState(null);
  const [deletingTillId, setDeletingTillId] = useState(null);
  const [deleteTillTarget, setDeleteTillTarget] = useState(null);
  const [deleteTillError, setDeleteTillError] = useState(null);

  // History tab
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [deletingSessionId, setDeletingSessionId] = useState(null);
  const [zReportSessionId, setZReportSessionId] = useState(null);
  const [handoverTarget, setHandoverTarget] = useState(null);
  const [handoverBusy, setHandoverBusy] = useState(false);
  const [handoverError, setHandoverError] = useState(null);

  const showFloatBreakdown = isPosTillFloatRequired(capabilities?.module_settings);
  const organizationName = capabilities?.profile_label ?? DEFAULT_PRINT_ORG_NAME;
  const canHandoverSession = Boolean(
    user?.is_admin ||
      capabilities?.permissions?.["sales.orders.approve"] ||
      capabilities?.permissions?.["sales.manage"],
  );

  const loadMeta = useCallback(async () => {
    if (!organizationId) return;
    setMetaLoading(true);
    setPageError(null);
    try {
      const [tillRes, branchRes, userRes, sessionRes] = await Promise.all([
        apiRequest("/tills", { searchParams: { per_page: 200 } }),
        apiRequest("/branches", { searchParams: { per_page: 200, ...orgListParams(organizationId) } }),
        apiRequest("/users", { searchParams: { per_page: 200, ...orgListParams(organizationId) } }),
        apiRequest("/till-float-sessions", {
          searchParams: { per_page: 200, "filter[status]": "open" },
        }).catch(() => ({ data: [] })),
      ]);
      setTills(tillRes.data ?? []);
      setBranches(filterByOrganization(branchRes.data, organizationId));
      setUsers(filterByOrganization(userRes.data, organizationId));
      const sessions = sessionRes.data ?? [];
      setOpenSessions(sessions);
      const reportEntries = await Promise.all(
        sessions.map(async (session) => {
          try {
            const report = await apiRequest(`/pos/sessions/${session.id}/x-report`);
            return [session.id, report];
          } catch {
            return [session.id, null];
          }
        }),
      );
      setSessionReports(new Map(reportEntries));
    } catch (e) {
      setPageError(e instanceof ApiError ? e.message : "Failed to load till data");
    } finally {
      setMetaLoading(false);
    }
  }, [organizationId]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const params = { per_page: 200 };
      if (historyStatus) params["filter[status]"] = historyStatus;
      const sessionRes = await apiRequest("/till-float-sessions", { searchParams: params });
      setHistoryRows(sessionRes.data ?? []);
    } catch (e) {
      setPageError(e instanceof ApiError ? e.message : "Failed to load session history");
    } finally {
      setHistoryLoading(false);
    }
  }, [historyStatus]);

  useEffect(() => {
    if (searchParams.get("tab") === "shift") {
      router.replace("/sales/till-management?tab=tills", { scroll: false });
    }
  }, [searchParams, router]);

  useEffect(() => {
    const zReport = searchParams.get("zReport");
    if (zReport) {
      setTab("history");
      setZReportSessionId(zReport);
    }
  }, [searchParams]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (tab === "history") loadHistory();
  }, [tab, loadHistory]);

  function switchTab(next) {
    setTab(next);
    router.replace(`/sales/till-management?tab=${next}`, { scroll: false });
  }

  const branchById = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const openByTill = useMemo(() => indexOpenSessionsByTill(openSessions), [openSessions]);

  const displayError = pageError;

  const filteredTills = useMemo(() => {
    const q = tillSearch.trim().toLowerCase();
    return tills.filter((t) => {
      const branch = branchById.get(t.branch_id)?.branch_name ?? "";
      const openSessionRow = openByTill.get(t.id);
      const cashier = openSessionRow
        ? userById.get(openSessionRow.cashier_id)
        : t.cashier_id
          ? userById.get(t.cashier_id)
          : null;
      const status = tillStatusLabel(t, openByTill);
      if (tillBranchFilter && String(t.branch_id) !== tillBranchFilter) return false;
      if (tillStatusFilter === "active" && status !== "Active") return false;
      if (tillStatusFilter === "closed" && status !== "Closed") return false;
      if (!q) return true;
      return `${t.till_number} ${t.till_name} ${branch} ${cashier?.full_name ?? ""}`.toLowerCase().includes(q);
    });
  }, [tills, tillSearch, tillBranchFilter, tillStatusFilter, branchById, userById, openByTill]);

  const tillStats = useMemo(() => {
    const active = tills.filter((t) => openByTill.has(t.id)).length;
    const totalFloat = openSessions.reduce((sum, session) => sum + Number(session.working_amount ?? 0), 0);
    return {
      total: tills.length,
      active,
      closed: Math.max(0, tills.length - active),
      totalFloat,
    };
  }, [tills, openByTill, openSessions]);

  const tillTotalPages = Math.max(1, Math.ceil(filteredTills.length / TILLS_PAGE_SIZE));
  const tillSafePage = Math.min(tillPage, tillTotalPages);
  const tillSlice = filteredTills.slice(
    (tillSafePage - 1) * TILLS_PAGE_SIZE,
    tillSafePage * TILLS_PAGE_SIZE,
  );

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return historyRows;
    return historyRows.filter((row) => {
      const till = tills.find((t) => t.id === row.till_id);
      const cashier = userById.get(row.cashier_id);
      return `${row.id} ${tillDisplayName(till)} ${cashier?.full_name ?? ""}`.toLowerCase().includes(q);
    });
  }, [historyRows, historySearch, tills, userById]);

  const historyTotalPages = Math.max(1, Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE));
  const historySafePage = Math.min(historyPage, historyTotalPages);
  const historySlice = filteredHistory.slice(
    (historySafePage - 1) * HISTORY_PAGE_SIZE,
    historySafePage * HISTORY_PAGE_SIZE,
  );

  function promptDeleteTill(till) {
    setDeleteTillError(null);
    setDeleteTillTarget(till);
  }

  async function confirmDeleteTill() {
    if (!deleteTillTarget) return;
    setDeletingTillId(deleteTillTarget.id);
    setDeleteTillError(null);
    try {
      await apiRequest(`/tills/${deleteTillTarget.id}`, { method: "DELETE" });
      if (activeSession?.till_id === deleteTillTarget.id) {
        clearSession();
      }
      setDeleteTillTarget(null);
      await loadMeta();
      if (tab === "history") await loadHistory();
    } catch (e) {
      setDeleteTillError(e instanceof ApiError ? e.message : "Could not delete till");
    } finally {
      setDeletingTillId(null);
    }
  }

  async function deleteHistorySession(row) {
    if (!window.confirm(`Delete session #${row.id}? Only allowed when the session has no linked sales.`)) return;
    setDeletingSessionId(row.id);
    setPageError(null);
    try {
      await apiRequest(`/till-float-sessions/${row.id}`, { method: "DELETE" });
      await loadHistory();
      await loadMeta();
      if (activeSession?.id === row.id) {
        clearSession();
      }
    } catch (e) {
      setPageError(e instanceof ApiError ? e.message : "Could not delete session");
    } finally {
      setDeletingSessionId(null);
    }
  }

  function openBreakdown(session, till, cashier) {
    setBreakdownSession({
      session,
      tillName: tillDisplayName(till),
      cashierName: cashier?.full_name ?? cashier?.username ?? null,
    });
  }

  function openFloatCorrection(session, till, cashier) {
    setEditingFloatSession({
      session,
      tillName: tillDisplayName(till),
      cashierName: cashier?.full_name ?? cashier?.username ?? null,
    });
    setFloatDrawerOpen(true);
  }

  async function handleHandover(payload) {
    if (!handoverTarget?.session?.id) return;
    setHandoverBusy(true);
    setHandoverError(null);
    try {
      await apiRequest(`/pos/sessions/${handoverTarget.session.id}/handover`, {
        method: "POST",
        body: payload,
      });
      setHandoverTarget(null);
      await loadMeta();
      if (tab === "history") await loadHistory();
    } catch (e) {
      setHandoverError(e instanceof ApiError ? e.message : "Could not hand over session");
      throw e;
    } finally {
      setHandoverBusy(false);
    }
  }

  function sessionHasFloat(session) {
    if (!session) return false;
    return (
      normalizeFloatEntries(session.float_breakdown).length > 0 ||
      Number(session.working_amount ?? 0) > 0
    );
  }

  function handleFloatSaved() {
    loadMeta();
    if (tab === "history") loadHistory();
  }

  return (
    <>
      <CatalogPageShell
        title="Till Management"
        subtitle="Monitor tills and cashier sessions. Cashiers declare float in POS; use Edit cashier float to fix mistakes."
        banner={
          displayError ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{displayError}</p>
          ) : null
        }
      >
        <TabBar active={tab} onChange={switchTab} />

        {tab === "tills" ? (
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Total tills" value={tillStats.total} hint="All locations" />
              <StatCard label="Active tills" value={tillStats.active} hint="Currently active" />
              <StatCard label="Closed tills" value={tillStats.closed} hint="Not in use" />
              <StatCard label="Total float" value={formatTillKes(tillStats.totalFloat)} hint="Across active tills" />
            </div>
            <div className="mb-4 flex flex-wrap gap-3">
              <SearchInput
                value={tillSearch}
                onChange={(e) => { setTillSearch(e.target.value); setTillPage(1); }}
                placeholder="Search till code, name, or branch…"
                className="min-w-[220px] flex-1 max-w-md"
              />
              <FilterSelect
                value={tillBranchFilter}
                onChange={(e) => { setTillBranchFilter(e.target.value); setTillPage(1); }}
                options={[
                  { value: "", label: "All branches" },
                  ...branches.map((b) => ({ value: String(b.id), label: b.branch_name })),
                ]}
              />
              <FilterSelect
                value={tillStatusFilter}
                onChange={(e) => { setTillStatusFilter(e.target.value); setTillPage(1); }}
                options={[
                  { value: "", label: "All statuses" },
                  { value: "active", label: "Active" },
                  { value: "closed", label: "Closed" },
                ]}
              />
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {metaLoading ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">Loading tills…</p>
              ) : tillSlice.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">No tills match your filters.</p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                      <th className="px-4 py-2.5">Till code</th>
                      <th className="px-4 py-2.5">Till name</th>
                      <th className="px-4 py-2.5">Branch</th>
                      <th className="px-4 py-2.5">Cashier</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Opening float</th>
                      <th className="px-4 py-2.5 text-right">Current float</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tillSlice.map((till) => {
                      const status = tillStatusLabel(till, openByTill);
                      const tone = tillStatusTone(till, openByTill);
                      const openSessionRow = openByTill.get(till.id);
                      const cashier = openSessionRow
                        ? userById.get(openSessionRow.cashier_id)
                        : till.cashier_id
                          ? userById.get(till.cashier_id)
                          : null;
                      const report = openSessionRow ? sessionReports.get(openSessionRow.id) : null;
                      const opening = openingFloatAmount(openSessionRow);
                      const current = currentFloatAmount(openSessionRow, report);
                      return (
                        <tr key={till.id} className="border-b border-slate-100 last:border-b-0">
                          <td className="px-4 py-3 font-medium text-slate-900">{tillCode(till)}</td>
                          <td className="px-4 py-3 text-slate-900">{tillDisplayName(till)}</td>
                          <td className="px-4 py-3 text-slate-700">{branchById.get(till.branch_id)?.branch_name ?? "—"}</td>
                          <td className="px-4 py-3 text-slate-700">{cashier?.full_name ?? cashier?.username ?? "—"}</td>
                          <td className="px-4 py-3"><PosStatusBadge label={status} tone={tone} /></td>
                          <td className="px-4 py-3 text-right text-slate-900">
                            {openSessionRow ? formatTillKes(opening) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-900">
                            {openSessionRow ? formatTillKes(current) : formatTillKes(0)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1">
                              {openSessionRow ? (
                                <IconButton
                                  label="View float"
                                  onClick={() => openBreakdown(openSessionRow, till, cashier)}
                                >
                                  <EyeIcon />
                                </IconButton>
                              ) : (
                                <IconButton label="View float" disabled>
                                  <EyeIcon />
                                </IconButton>
                              )}
                              <IconButton label="Edit till" onClick={() => { setEditingTill(till); setDrawerOpen(true); }}>
                                <PencilIcon />
                              </IconButton>
                              <TillActionsMenu
                                deleting={deletingTillId === till.id}
                                onEditTill={() => { setEditingTill(till); setDrawerOpen(true); }}
                                onCorrectFloat={
                                  openSessionRow && sessionHasFloat(openSessionRow)
                                    ? () => openFloatCorrection(openSessionRow, till, cashier)
                                    : undefined
                                }
                                onDelete={() => promptDeleteTill(till)}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <PaginationBar
                page={tillSafePage}
                totalPages={tillTotalPages}
                total={filteredTills.length}
                pageSize={TILLS_PAGE_SIZE}
                onChange={setTillPage}
              />
            </div>
          </>
        ) : null}

        {tab === "history" ? (
          <>
            <div className="mb-4 flex flex-wrap gap-3">
              <SearchInput
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search session, till, cashier…"
                className="max-w-md"
              />
              <FilterSelect
                value={historyStatus}
                onChange={(e) => { setHistoryStatus(e.target.value); setHistoryPage(1); }}
                options={[
                  { value: "", label: "All statuses" },
                  { value: "open", label: "Open" },
                  { value: "closed", label: "Closed" },
                ]}
              />
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {historyLoading ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">Loading sessions…</p>
              ) : historySlice.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">No sessions found.</p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                      <th className="px-4 py-2.5">Session</th>
                      <th className="px-4 py-2.5">Till</th>
                      <th className="px-4 py-2.5">Cashier</th>
                      <th className="px-4 py-2.5">Operating float</th>
                      <th className="px-4 py-2.5">Opened</th>
                      <th className="px-4 py-2.5">Closed</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historySlice.map((row) => {
                      const till = tills.find((t) => t.id === row.till_id);
                      const cashier = userById.get(row.cashier_id);
                      const isOpen = String(row.status).toLowerCase() === "open";
                      const isSuspended = String(row.status).toLowerCase() === "suspended";
                      return (
                        <tr key={row.id} className="border-b border-slate-100 last:border-b-0">
                          <td className="px-4 py-3 font-medium text-slate-900">#{row.id}</td>
                          <td className="px-4 py-3 text-slate-700">{tillDisplayName(till)}</td>
                          <td className="px-4 py-3 text-slate-700">{cashier?.full_name ?? cashier?.username ?? "—"}</td>
                          <td className="px-4 py-3">
                            <FloatTotalLink
                              session={row}
                              onClick={() => openBreakdown(row, till, cashier)}
                            />
                          </td>
                          <td className="px-4 py-3 text-slate-600">{formatShortDate(row.opened_at)} {formatSessionTime(row.opened_at)}</td>
                          <td className="px-4 py-3 text-slate-600">{row.closed_at ? `${formatShortDate(row.closed_at)} ${formatSessionTime(row.closed_at)}` : "—"}</td>
                          <td className="px-4 py-3">
                            <PosStatusBadge
                              label={isOpen ? "Open" : isSuspended ? "Suspended" : "Closed"}
                              tone={isOpen ? "open" : isSuspended ? "suspended" : "closed"}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1">
                              {isOpen ? (
                                <>
                                  <IconLink href="/sales/pos" label="Create order">
                                    <OpenPosIcon />
                                  </IconLink>
                                  {canHandoverSession ? (
                                    <IconButton
                                      label="Hand over session"
                                      onClick={() => {
                                        setHandoverError(null);
                                        setHandoverTarget({ session: row, till, cashier });
                                      }}
                                    >
                                      <span className="text-[10px] font-bold">H</span>
                                    </IconButton>
                                  ) : null}
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setZReportSessionId(String(row.id))}
                                  className="rounded-md px-1 text-xs font-medium text-[#185FA5] hover:bg-[#E6F1FB] hover:underline"
                                  title="View Z report"
                                >
                                  Z
                                </button>
                              )}
                              {sessionHasFloat(row) ? (
                                <IconButton
                                  label="Edit cashier float"
                                  onClick={() => openFloatCorrection(row, till, cashier)}
                                >
                                  <PencilIcon />
                                </IconButton>
                              ) : null}
                              <IconButton
                                label="Delete session"
                                danger
                                disabled={deletingSessionId === row.id}
                                onClick={() => void deleteHistorySession(row)}
                              >
                                <TrashIcon />
                              </IconButton>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <PaginationBar
                page={historySafePage}
                totalPages={historyTotalPages}
                total={filteredHistory.length}
                pageSize={HISTORY_PAGE_SIZE}
                onChange={setHistoryPage}
              />
            </div>
          </>
        ) : null}
      </CatalogPageShell>

      <FloatBreakdownModal
        open={Boolean(breakdownSession)}
        onClose={() => setBreakdownSession(null)}
        session={breakdownSession?.session}
        tillName={breakdownSession?.tillName}
        cashierName={breakdownSession?.cashierName}
        onCorrectFloat={
          breakdownSession?.session && sessionHasFloat(breakdownSession.session)
            ? () => {
                openFloatCorrection(
                  breakdownSession.session,
                  tills.find((t) => t.id === breakdownSession.session.till_id),
                  userById.get(breakdownSession.session.cashier_id),
                );
                setBreakdownSession(null);
              }
            : undefined
        }
      />

      <EditSessionFloatDrawer
        open={floatDrawerOpen}
        onClose={() => {
          setFloatDrawerOpen(false);
          setEditingFloatSession(null);
        }}
        onSaved={handleFloatSaved}
        session={editingFloatSession?.session}
        tillName={editingFloatSession?.tillName}
        cashierName={editingFloatSession?.cashierName}
      />

      <DeleteTillConfirmModal
        open={Boolean(deleteTillTarget)}
        onClose={() => {
          if (deletingTillId) return;
          setDeleteTillTarget(null);
          setDeleteTillError(null);
        }}
        onConfirm={() => void confirmDeleteTill()}
        till={deleteTillTarget}
        openSession={deleteTillTarget ? openByTill.get(deleteTillTarget.id) : null}
        cashierName={
          deleteTillTarget
            ? (() => {
                const session = openByTill.get(deleteTillTarget.id);
                const cashierId = session?.cashier_id ?? deleteTillTarget.cashier_id;
                const cashier = cashierId ? userById.get(cashierId) : null;
                return cashier?.full_name ?? cashier?.username ?? null;
              })()
            : null
        }
        deleting={Boolean(deleteTillTarget && deletingTillId === deleteTillTarget.id)}
        error={deleteTillError}
      />

      <HandoverSessionModal
        open={Boolean(handoverTarget)}
        onClose={() => {
          if (handoverBusy) return;
          setHandoverTarget(null);
          setHandoverError(null);
        }}
        session={handoverTarget?.session}
        tillName={handoverTarget?.till ? tillDisplayName(handoverTarget.till) : null}
        cashierName={handoverTarget?.cashier?.full_name ?? handoverTarget?.cashier?.username ?? null}
        cashiers={users.filter((u) => u.is_active !== false)}
        onHandover={handleHandover}
        busy={handoverBusy}
        error={handoverError}
      />

      <ZReportModal
        open={Boolean(zReportSessionId)}
        sessionId={zReportSessionId}
        onClose={() => {
          setZReportSessionId(null);
          if (searchParams.get("zReport")) {
            router.replace("/sales/till-management?tab=history", { scroll: false });
          }
        }}
        organizationName={organizationName}
        showFloatBreakdown={showFloatBreakdown}
        fallbackCashierName={user?.full_name ?? user?.username ?? null}
      />

      <TillFormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={loadMeta}
        editing={editingTill}
        branches={branches}
        existingTills={tills}
      />
    </>
  );
}
