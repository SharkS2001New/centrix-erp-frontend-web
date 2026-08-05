"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import { useAuth } from "@/contexts/auth-context";
import { usePosSession } from "@/contexts/pos-session-context";
import { filterByOrganization } from "@/lib/admin";
import { fetchBranchesCached, fetchUsersCached } from "@/lib/reference-data-cache";
import {
  CatalogPageShell,
  Field,
  FILTER_CONTROL_CLASS,
  FilterSelect,
  FilterToolbar,
  IconButton,
  PaginationBar,
  PencilIcon,
  PrimaryButton,
  SearchInput,
  StatCard,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
import { PosStatusBadge } from "@/components/pos/pos-shared";
import { CloseSessionModal, ZReportModal, HandoverSessionModal } from "@/components/pos/pos-session-modals";
import {
  EditSessionFloatDrawer,
  FloatBreakdownModal,
  FloatTotalLink,
  TillFormDrawer,
} from "@/components/pos/till-session-ui";
import {
  currentFloatAmount,
  formatSessionTime,
  formatTillKes,
  groupOpenSessionsByTill,
  indexOpenSessionsByTill,
  normalizeFloatEntries,
  openingFloatAmount,
  tillCode,
  tillDisplayName,
  tillLockLabel,
  tillStatusLabel,
  tillStatusTone,
  canReopenTillSession,
} from "@/lib/pos-till";
import { getPosDeviceIdentifier } from "@/lib/pos-device";
import { addDaysToCalendarDate, todayCalendarDate } from "@/lib/datetime";
import { isBlindTillCloseEnabled, isPosTillFloatRequired } from "@/lib/sales-settings";
import { useConfirm } from "@/lib/use-confirm";

const TABS = [
  { id: "tills", label: "Current Open Sessions" },
  { id: "history", label: "Session history" },
  { id: "locks", label: "Till locks" },
];

const HISTORY_PAGE_SIZE = 10;
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

function MoreIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="5" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="19" r="1.75" />
    </svg>
  );
}

function TillActionsMenu({ onEditTill, onCorrectFloat }) {
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
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const initialTab = ["history", "locks"].includes(searchParams.get("tab") ?? "")
    ? searchParams.get("tab")
    : "tills";

  const { user, capabilities } = useAuth();
  const { activeSession, clearSession } = usePosSession();

  const organizationId = user?.organization_id ?? capabilities?.organization_id;
  const orgTimeZone = capabilities?.general?.timezone ?? "Africa/Nairobi";
  const todayKey = todayCalendarDate(orgTimeZone);
  const defaultHistoryFromDate = addDaysToCalendarDate(todayKey, -1, orgTimeZone);

  const [tab, setTab] = useState(initialTab);
  const [pageError, setPageError] = useState(null);

  // Shared meta
  const [tills, setTills] = useState([]);
  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [openSessions, setOpenSessions] = useState([]);
  const [sessionReports, setSessionReports] = useState(() => new Map());
  const sessionReportsRef = useRef(sessionReports);
  useEffect(() => {
    sessionReportsRef.current = sessionReports;
  }, [sessionReports]);
  const xReportInflightRef = useRef(new Map());
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

  // History tab
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState("");
  const [historyFromDate, setHistoryFromDate] = useState(defaultHistoryFromDate);
  const [historyToDate, setHistoryToDate] = useState(todayKey);
  const [historyFromDraft, setHistoryFromDraft] = useState(defaultHistoryFromDate);
  const [historyToDraft, setHistoryToDraft] = useState(todayKey);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);

  // Till locks tab
  const [lockDrafts, setLockDrafts] = useState({});
  const [lockSavingId, setLockSavingId] = useState(null);
  const [zReportSessionId, setZReportSessionId] = useState(null);
  const [handoverTarget, setHandoverTarget] = useState(null);
  const [handoverBusy, setHandoverBusy] = useState(false);
  const [handoverError, setHandoverError] = useState(null);
  const [closeTarget, setCloseTarget] = useState(null);
  const [closeReport, setCloseReport] = useState(null);
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeError, setCloseError] = useState(null);
  const [reopeningSessionId, setReopeningSessionId] = useState(null);

  const showFloatBreakdown = isPosTillFloatRequired(capabilities?.module_settings);
  const blindTillClose = isBlindTillCloseEnabled(capabilities?.module_settings);
  const organizationName = capabilities?.profile_label ?? DEFAULT_PRINT_ORG_NAME;
  const canManageSessions = Boolean(
    user?.is_admin ||
      capabilities?.permissions?.["sales.manage"] ||
      capabilities?.permissions?.["sales.orders.approve"],
  );
  const canHandoverSession = canManageSessions;

  const loadMeta = useCallback(async () => {
    if (!organizationId) return;
    setMetaLoading(true);
    setPageError(null);
    try {
      const [tillRes, branchesData, usersData, sessionRes] = await Promise.all([
        apiRequest("/tills", { searchParams: { per_page: 200 } }),
        fetchBranchesCached(organizationId),
        fetchUsersCached(organizationId),
        apiRequest("/till-float-sessions", {
          searchParams: {
            per_page: 200,
            "filter[status]": "open",
            "filter[session_date]": todayKey,
          },
        }).catch(() => ({ data: [] })),
      ]);
      setTills(tillRes.data ?? []);
      setBranches(filterByOrganization(branchesData, organizationId));
      setUsers(filterByOrganization(usersData, organizationId));
      const sessions = sessionRes.data ?? [];
      setOpenSessions(sessions);
      // X-reports load lazily on float expand/select — avoid N+1 on list load.
      setSessionReports(new Map());
      xReportInflightRef.current = new Map();
    } catch (e) {
      setPageError(e instanceof ApiError ? e.message : "Failed to load till data");
    } finally {
      setMetaLoading(false);
    }
  }, [organizationId, todayKey]);

  const ensureSessionXReport = useCallback(async (sessionId) => {
    if (sessionId == null) return null;
    const id = Number(sessionId);
    if (!Number.isFinite(id)) return null;

    if (sessionReportsRef.current.has(id)) {
      return sessionReportsRef.current.get(id);
    }

    const inflight = xReportInflightRef.current.get(id);
    if (inflight) return inflight;

    const request = apiRequest(`/pos/sessions/${id}/x-report`, { loading: false })
      .then((report) => {
        setSessionReports((prev) => {
          const next = new Map(prev);
          next.set(id, report);
          return next;
        });
        return report;
      })
      .catch(() => {
        setSessionReports((prev) => {
          const next = new Map(prev);
          next.set(id, null);
          return next;
        });
        return null;
      })
      .finally(() => {
        xReportInflightRef.current.delete(id);
      });

    xReportInflightRef.current.set(id, request);
    return request;
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const params = {
        per_page: HISTORY_PAGE_SIZE,
        page: historyPage,
      };
      if (historyStatus) params["filter[status]"] = historyStatus;
      if (historyFromDate) params.from_date = historyFromDate;
      if (historyToDate) params.to_date = historyToDate;
      const sessionRes = await apiRequest("/till-float-sessions", { searchParams: params });
      setHistoryRows(sessionRes.data ?? []);
      setHistoryTotal(Number(sessionRes.total ?? sessionRes.meta?.total ?? 0));
      setHistoryTotalPages(Math.max(1, Number(sessionRes.last_page ?? sessionRes.meta?.last_page ?? 1)));
    } catch (e) {
      setPageError(e instanceof ApiError ? e.message : "Failed to load session history");
    } finally {
      setHistoryLoading(false);
    }
  }, [historyStatus, historyFromDate, historyToDate, historyPage]);

  const applyHistoryDateRange = useCallback(() => {
    setHistoryFromDate(historyFromDraft);
    setHistoryToDate(historyToDraft);
    setHistoryPage(1);
  }, [historyFromDraft, historyToDraft]);

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
  const openSessionsByTill = useMemo(() => groupOpenSessionsByTill(openSessions), [openSessions]);
  const localDeviceId = useMemo(() => getPosDeviceIdentifier(), []);

  const displayError = pageError;

  const filteredTills = useMemo(() => {
    const q = tillSearch.trim().toLowerCase();
    return tills.filter((t) => {
      // Keep Till Management list focused on usable tills only.
      if (t.is_active === false) return false;
      const branch = branchById.get(t.branch_id)?.branch_name ?? "";
      const openSessionRow = openByTill.get(t.id);
      const activeCashier = openSessionRow ? userById.get(openSessionRow.cashier_id) : null;
      const lockedCashier = t.cashier_id ? userById.get(t.cashier_id) : null;
      const status = tillStatusLabel(t, openByTill);
      if (tillBranchFilter && String(t.branch_id) !== tillBranchFilter) return false;
      if (tillStatusFilter === "active" && status !== "Active") return false;
      if (tillStatusFilter === "available" && status !== "Closed") return false;
      if (!q) return true;
      return `${t.till_number} ${t.till_name} ${branch} ${activeCashier?.full_name ?? ""} ${lockedCashier?.full_name ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [tills, tillSearch, tillBranchFilter, tillStatusFilter, branchById, userById, openByTill]);

  const tillStats = useMemo(() => {
    const visible = tills.filter((t) => t.is_active !== false);
    const active = visible.filter((t) => openByTill.has(t.id)).length;
    const totalFloat = openSessions.reduce((sum, session) => sum + Number(session.working_amount ?? 0), 0);
    return {
      total: visible.length,
      active,
      available: Math.max(0, visible.length - active),
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

  const historySafePage = Math.min(historyPage, historyTotalPages);
  const historySlice = filteredHistory;

  const availableLockTills = useMemo(
    () => tills.filter((t) => t.is_active !== false),
    [tills],
  );

  function lockDraftForTill(till) {
    if (lockDrafts[till.id]) return lockDrafts[till.id];
    return {
      lock_mode: till.lock_mode ?? "",
      cashier_id: till.cashier_id != null ? String(till.cashier_id) : "",
      ip_address: till.ip_address ?? "",
    };
  }

  function setLockDraft(tillId, till, patch) {
    setLockDrafts((prev) => ({
      ...prev,
      [tillId]: { ...lockDraftForTill(till), ...patch },
    }));
  }

  function tillHasActiveSession(tillId) {
    return (openSessionsByTill.get(tillId) ?? []).length > 0;
  }

  function userHasActiveSession(userId) {
    return openSessions.some((s) => Number(s.cashier_id) === Number(userId));
  }

  async function saveTillLock(till) {
    const draft = lockDrafts[till.id] ?? lockDraftForTill(till);
    const lockMode = draft.lock_mode || null;

    if (lockMode === "user") {
      if (tillHasActiveSession(till.id)) {
        setPageError("Close active sessions on this till before locking it to a user.");
        return;
      }
      if (!draft.cashier_id) {
        setPageError("Select a cashier to lock this till.");
        return;
      }
      if (userHasActiveSession(draft.cashier_id)) {
        setPageError("That cashier has an active session. Close it before assigning this till.");
        return;
      }
    }

    if (lockMode === "computer" && !String(draft.ip_address ?? "").trim()) {
      setPageError("Enter a computer identifier (device ID or address).");
      return;
    }

    setLockSavingId(till.id);
    setPageError(null);
    try {
      const body = lockMode
        ? {
            lock_mode: lockMode,
            cashier_id: lockMode === "user" ? Number(draft.cashier_id) : null,
            ip_address: lockMode === "computer" ? String(draft.ip_address).trim() : null,
          }
        : { lock_mode: null, cashier_id: null, ip_address: null };
      await apiRequest(`/tills/${till.id}`, { method: "PATCH", body });
      setLockDrafts((prev) => {
        const next = { ...prev };
        delete next[till.id];
        return next;
      });
      await loadMeta();
    } catch (e) {
      setPageError(e instanceof ApiError ? e.message : "Could not save till lock");
    } finally {
      setLockSavingId(null);
    }
  }

  function promptCloseSession(row, till, cashier) {
    setCloseError(null);
    setCloseReport(null);
    setCloseTarget({ session: row, till, cashier });
    void ensureSessionXReport(row.id).then((report) => setCloseReport(report));
  }

  async function handleAdminCloseSession(payload) {
    if (!closeTarget?.session?.id) return;
    setCloseBusy(true);
    setCloseError(null);
    try {
      await apiRequest(`/pos/sessions/${closeTarget.session.id}/close`, {
        method: "POST",
        body: {
          closing_amount: Number(payload.closing_amount),
          expected_amount:
            payload.expected_amount != null ? Number(payload.expected_amount) : undefined,
          notes: payload.notes?.trim() || null,
          closing_denominations: payload.closing_denominations ?? null,
        },
      });
      if (activeSession?.id === closeTarget.session.id) {
        clearSession();
      }
      setCloseTarget(null);
      setCloseReport(null);
      await loadMeta();
      if (tab === "history") await loadHistory();
    } catch (e) {
      setCloseError(e instanceof ApiError ? e.message : "Could not close session");
      throw e;
    } finally {
      setCloseBusy(false);
    }
  }

  async function reopenHistorySession(row) {
    if (!canReopenTillSession(row, todayKey)) {
      setPageError("Only today's closed sessions can be reopened.");
      return;
    }
    const ok = await confirm({
      title: "Reopen session",
      message: `Reopen session #${row.id} for today so the cashier can continue selling?`,
      confirmLabel: "Reopen",
    });
    if (!ok) return;
    setReopeningSessionId(row.id);
    setPageError(null);
    try {
      await apiRequest(`/pos/sessions/${row.id}/reopen`, { method: "POST" });
      await loadHistory();
      await loadMeta();
    } catch (e) {
      setPageError(e instanceof ApiError ? e.message : "Could not reopen session");
    } finally {
      setReopeningSessionId(null);
    }
  }

  function openBreakdown(session, till, cashier) {
    setBreakdownSession({
      session,
      tillName: tillDisplayName(till),
      cashierName: cashier?.full_name ?? cashier?.username ?? null,
    });
    if (session?.id != null && String(session.status).toLowerCase() === "open") {
      void ensureSessionXReport(session.id);
    }
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

  function openAddTill() {
    setEditingTill(null);
    setDrawerOpen(true);
  }

  function openEditTill(till) {
    setEditingTill(till);
    setDrawerOpen(true);
  }

  return (
    <>
      <CatalogPageShell
        title="Till Management"
        subtitle="Monitor tills and cashier sessions. Managers can close an active session or reopen today's closed session if it was closed by mistake."
        action={
          tab === "tills" ? (
            <PrimaryButton type="button" onClick={openAddTill}>
              Add New Till
            </PrimaryButton>
          ) : null
        }
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
              <StatCard label="Available tills" value={tillStats.available} hint="Ready to open session" />
              <StatCard label="Total float" value={formatTillKes(tillStats.totalFloat)} hint="Across active tills" />
            </div>
            <div className="mb-4 flex flex-wrap gap-3">
              <SearchInput
                value={tillSearch}
                onChange={(e) => { setTillSearch(e.target.value); setTillPage(1); }}
                placeholder="Search till code, name, or branch…"
                className="min-w-0 w-full flex-1 max-w-xl"
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
                  { value: "available", label: "Available" },
                ]}
              />
            </div>
            <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
              {metaLoading ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">Loading tills…</p>
              ) : tillSlice.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm text-slate-500">
                    {tills.length === 0
                      ? "No tills yet. Create one to start cashier sessions."
                      : "No tills match your filters."}
                  </p>
                  {tills.length === 0 ? (
                    <PrimaryButton type="button" className="mt-4" onClick={openAddTill}>
                      Add New Till
                    </PrimaryButton>
                  ) : null}
                </div>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="theme-table-head-row text-left text-xs font-medium">
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
                      const cashier = openSessionRow ? userById.get(openSessionRow.cashier_id) : null;
                      const lockedCashier = !openSessionRow && till.cashier_id
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
                          <td className="px-4 py-3 text-slate-700">
                            {cashier?.full_name ?? cashier?.username ?? "—"}
                            {!cashier && lockedCashier ? (
                              <span className="ml-2 text-xs text-slate-500">
                                (Locked to {lockedCashier.full_name ?? lockedCashier.username ?? "user"})
                              </span>
                            ) : null}
                            {till.lock_mode === "computer" && till.ip_address ? (
                              <span className="ml-2 text-xs text-slate-500">
                                (Computer: {till.ip_address})
                              </span>
                            ) : null}
                            {(openSessionsByTill.get(till.id) ?? []).length > 1 ? (
                              <span className="ml-2 text-xs text-slate-500">
                                (+{(openSessionsByTill.get(till.id) ?? []).length - 1} sessions)
                              </span>
                            ) : null}
                          </td>
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
                              <IconButton label="Edit till" onClick={() => openEditTill(till)}>
                                <PencilIcon />
                              </IconButton>
                              <TillActionsMenu
                                onEditTill={() => openEditTill(till)}
                                onCorrectFloat={
                                  openSessionRow && sessionHasFloat(openSessionRow)
                                    ? () => openFloatCorrection(openSessionRow, till, cashier)
                                    : undefined
                                }
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

        {tab === "locks" ? (
          <>
            <p className="mb-4 text-sm text-slate-600">
              Lock a till to one cashier, or to this computer so any user on that PC opens the same till.
              User lock and computer lock are mutually exclusive. Computer-locked tills allow multiple cashiers
              on the same till when a session is already open.
            </p>
            {localDeviceId ? (
              <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
                This browser&apos;s device ID: <span className="font-mono text-slate-800">{localDeviceId}</span>
                {" "}(use when locking a till to this computer)
              </p>
            ) : null}
            <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
              {metaLoading ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">Loading tills…</p>
              ) : availableLockTills.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">No tills available.</p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="theme-table-head-row text-left text-xs font-medium">
                      <th className="px-4 py-2.5">Till</th>
                      <th className="px-4 py-2.5">Branch</th>
                      <th className="px-4 py-2.5">Current lock</th>
                      <th className="px-4 py-2.5">Lock mode</th>
                      <th className="px-4 py-2.5">Assign to</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableLockTills.map((till) => {
                      const draft = lockDraftForTill(till);
                      const activeSessions = openSessionsByTill.get(till.id) ?? [];
                      const busy = activeSessions.length > 0;
                      return (
                        <tr key={till.id} className="border-b border-slate-100 last:border-b-0">
                          <td className="px-4 py-3 font-medium text-slate-900">{tillDisplayName(till)}</td>
                          <td className="px-4 py-3 text-slate-700">{branchById.get(till.branch_id)?.branch_name ?? "—"}</td>
                          <td className="px-4 py-3 text-slate-600">{tillLockLabel(till, userById) ?? "None"}</td>
                          <td className="px-4 py-3">
                            <select
                              className="w-full min-w-[8rem] rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                              value={draft.lock_mode}
                              onChange={(e) => setLockDraft(till.id, till, { lock_mode: e.target.value })}
                            >
                              <option value="">No lock</option>
                              <option value="user">Lock to user</option>
                              <option value="computer">Lock to computer</option>
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            {draft.lock_mode === "user" ? (
                              <select
                                className="w-full min-w-[10rem] rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                                value={draft.cashier_id}
                                onChange={(e) => setLockDraft(till.id, till, { cashier_id: e.target.value })}
                              >
                                <option value="">Select cashier</option>
                                {users
                                  .filter((u) => u?.is_active !== false)
                                  .map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.full_name ?? u.username ?? `User #${u.id}`}
                                    </option>
                                  ))}
                              </select>
                            ) : draft.lock_mode === "computer" ? (
                              <input
                                className="w-full min-w-[12rem] rounded-md border border-slate-200 px-2 py-1.5 text-sm font-mono"
                                value={draft.ip_address}
                                onChange={(e) => setLockDraft(till.id, till, { ip_address: e.target.value })}
                                placeholder="Device ID or IP address"
                              />
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              disabled={lockSavingId === till.id || (busy && draft.lock_mode)}
                              onClick={() => void saveTillLock(till)}
                              className="rounded-md bg-[#185FA5] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#134d87] disabled:opacity-50"
                              title={busy ? "Close active sessions before changing lock" : undefined}
                            >
                              {lockSavingId === till.id ? "Saving…" : "Save"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : null}

        {tab === "history" ? (
          <>
            <FilterToolbar className="flex-wrap overflow-visible">
              <div className="min-w-[14rem] flex-1 basis-[16rem] max-w-xl">
                <SearchInput
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search session, till, cashier…"
                  className="w-full"
                />
              </div>
              <Field label="From">
                <input
                  type="date"
                  value={historyFromDraft}
                  onChange={(e) => {
                    setHistoryFromDraft(e.target.value);
                  }}
                  className={FILTER_CONTROL_CLASS}
                />
              </Field>
              <Field label="To">
                <input
                  type="date"
                  value={historyToDraft}
                  onChange={(e) => {
                    setHistoryToDraft(e.target.value);
                  }}
                  className={FILTER_CONTROL_CLASS}
                />
              </Field>
              <FilterSelect
                value={historyStatus}
                onChange={(e) => { setHistoryStatus(e.target.value); setHistoryPage(1); }}
                options={[
                  { value: "", label: "All statuses" },
                  { value: "open", label: "Open" },
                  { value: "closed", label: "Closed" },
                ]}
              />
              <PrimaryButton type="button" showIcon={false} onClick={() => applyHistoryDateRange()}>
                Filter
              </PrimaryButton>
            </FilterToolbar>
            <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
              {historyLoading ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">Loading sessions…</p>
              ) : historySlice.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">No sessions found.</p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="theme-table-head-row text-left text-xs font-medium">
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
                      const canReopen = canReopenTillSession(row, todayKey);
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
                                  {canManageSessions ? (
                                    <button
                                      type="button"
                                      onClick={() => promptCloseSession(row, till, cashier)}
                                      className="rounded-md px-1.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50"
                                      title="Close session"
                                    >
                                      Close
                                    </button>
                                  ) : null}
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
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setZReportSessionId(String(row.id))}
                                    className="rounded-md px-1 text-xs font-medium text-[#185FA5] hover:bg-[#E6F1FB] hover:underline"
                                    title="View Z report"
                                  >
                                    Z
                                  </button>
                                  {!isSuspended && canReopen ? (
                                    <button
                                      type="button"
                                      onClick={() => void reopenHistorySession(row)}
                                      disabled={reopeningSessionId === row.id}
                                      className="rounded-md px-1.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                                      title="Reopen today's session"
                                    >
                                      {reopeningSessionId === row.id ? "…" : "Reopen"}
                                    </button>
                                  ) : null}
                                </>
                              )}
                              {sessionHasFloat(row) ? (
                                <IconButton
                                  label="Edit cashier float"
                                  onClick={() => openFloatCorrection(row, till, cashier)}
                                >
                                  <PencilIcon />
                                </IconButton>
                              ) : null}
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
                total={!historySearch.trim() ? historyTotal : filteredHistory.length}
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

      <CloseSessionModal
        open={Boolean(closeTarget)}
        onClose={() => {
          if (closeBusy) return;
          setCloseTarget(null);
          setCloseReport(null);
          setCloseError(null);
        }}
        session={closeTarget?.session}
        sessionReport={closeReport}
        closeSession={handleAdminCloseSession}
        busy={closeBusy}
        error={closeError}
        requireTillFloat={showFloatBreakdown}
        blindTillClose={blindTillClose}
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
        onClose={() => {
          setDrawerOpen(false);
          setEditingTill(null);
        }}
        onSaved={loadMeta}
        editing={editingTill}
        branches={branches}
        existingTills={tills}
        users={users}
      />
    </>
  );
}
