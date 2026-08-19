"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { formatReceiptNumber, formatSaleKes, saleCustomerLabel } from "@/lib/sales";
import { saleBalanceDue } from "@/lib/order-workflow";
import { SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";
import { ActionRequestRejectionDialog } from "@/components/action-request-rejection-dialog";

const CARD_CLASS =
  "flex min-w-[9.5rem] flex-col gap-0.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

const PRIMARY_BTN =
  "inline-flex items-center justify-center rounded-lg bg-[var(--theme-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50";

const REJECT_BTN =
  "inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50";

function PendingDecisionFooter({
  busy,
  loading,
  selectedCount,
  onClose,
  onReject,
  onApprove,
  approveLabel,
  rejectLabel,
}) {
  const disabled = Boolean(busy) || loading || selectedCount === 0;
  return (
    <>
      <button type="button" className={SECONDARY_BTN_CLASS} disabled={Boolean(busy)} onClick={onClose}>
        Close
      </button>
      <button type="button" disabled={disabled} onClick={onReject} className={REJECT_BTN}>
        {busy === "reject" ? "Rejecting…" : rejectLabel}
      </button>
      <button type="button" disabled={disabled} onClick={onApprove} className={PRIMARY_BTN}>
        {busy === "approve" ? "Approving…" : approveLabel}
      </button>
    </>
  );
}

function formatWhen(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isMissingApiRouteError(error) {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 404) return true;
  return /route .* could not be found/i.test(String(error.message || ""));
}

/** Load performed + pending lists without leaving a second 404 as unhandledrejection. */
async function loadPerformedAndPending(performedPath, pendingPath, missingMessage) {
  const results = await Promise.allSettled([
    apiRequest(performedPath, { loading: false }),
    apiRequest(pendingPath, { loading: false }),
  ]);
  const errors = results.filter((r) => r.status === "rejected").map((r) => r.reason);
  if (errors.length) {
    if (errors.some(isMissingApiRouteError)) {
      throw new ApiError(missingMessage, 404, errors[0]?.body);
    }
    throw errors[0];
  }
  return [results[0].value, results[1].value];
}

function ModalShell({ open, title, onClose, children, footer, busy = false, widthClass = "max-w-lg" }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === "Escape" && !busy) onClose?.();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose, open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`theme-panel flex max-h-[90vh] w-full ${widthClass} flex-col overflow-hidden rounded-xl border shadow-xl`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function unpaidOrdersOnPage(orders) {
  return (orders ?? []).filter((sale) => {
    if (!sale?.id) return false;
    if (String(sale.status ?? "").toLowerCase() === "cancelled") return false;
    return saleBalanceDue(sale) > 0.009;
  });
}

function returnLineLabel(line) {
  const name = String(line?.product_name || line?.product?.product_name || "").trim();
  if (name) return name;
  return String(line?.product_code || "?").trim() || "?";
}

function returnItemSummary(row) {
  const lines = Array.isArray(row?.lines) ? row.lines : [];
  return lines.map((l) => `${returnLineLabel(l)} × ${l.return_qty}`).join(", ");
}

function listFilterQuery({ fromDate = "", toDate = "", cashierId = "", routeId = "" } = {}) {
  const qs = new URLSearchParams();
  if (fromDate) qs.set("from_date", fromDate);
  if (toDate) qs.set("to_date", toDate);
  if (cashierId) qs.set("cashier_id", String(cashierId));
  if (routeId) qs.set("route_id", String(routeId));
  return qs.toString() ? `?${qs.toString()}` : "";
}

function listFilterBody({ cashierId = "", routeId = "" } = {}) {
  const body = {};
  if (cashierId) body.cashier_id = Number(cashierId) || cashierId;
  if (routeId) body.route_id = Number(routeId) || routeId;
  return body;
}

function filterScopeHint({ fromDate = "", toDate = "", cashierId = "", routeId = "" } = {}) {
  const dateHint =
    fromDate && toDate
      ? fromDate === toDate
        ? fromDate
        : `${fromDate} → ${toDate}`
      : fromDate || toDate || "all dates";
  const who = cashierId ? "the selected user" : routeId ? "the selected route" : null;
  return who ? `${dateHint} · ${who}` : dateHint;
}

function ReturnsModal({
  open,
  onClose,
  onApproved,
  fromDate = "",
  toDate = "",
  cashierId = "",
  routeId = "",
}) {
  const [tab, setTab] = useState("performed");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [performed, setPerformed] = useState([]);
  const [pending, setPending] = useState([]);
  const [selected, setSelected] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = listFilterQuery({ fromDate, toDate, cashierId, routeId });

      const [performedRes, pendingRes] = await loadPerformedAndPending(
        `/sales/mobile-orders/performed-returns${query}`,
        `/sales/mobile-orders/pending-returns${query}`,
        "Return approval is not available on this server yet. Deploy the latest API, then try again.",
      );
      const performedRows = Array.isArray(performedRes?.data) ? performedRes.data : [];
      const pendingRows = Array.isArray(pendingRes?.data) ? pendingRes.data : [];
      setPerformed(performedRows);
      setPending(pendingRows);
      setSelected(new Set(pendingRows.map((r) => r.id)));
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load returns.");
      setPerformed([]);
      setPending([]);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }, [cashierId, fromDate, routeId, toDate]);

  useEffect(() => {
    if (!open) {
      setRejectOpen(false);
      return;
    }
    setTab("performed");
    void load();
  }, [load, open]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const approve = async () => {
    const ids = [...selected];
    if (!ids.length) {
      notifyError("Select at least one return to approve.");
      return;
    }
    setBusy("approve");
    try {
      const res = await apiRequest("/sales/mobile-orders/approve-returns", {
        method: "POST",
        body: { return_ids: ids, ...listFilterBody({ cashierId, routeId }) },
        loading: false,
      });
      const count = Number(res?.approved_count ?? 0);
      const errs = Array.isArray(res?.errors) ? res.errors : [];
      if (count > 0) {
        notifySuccess(
          count === 1
            ? "1 return approved — stock restocked."
            : `${count} returns approved — stock restocked.`,
        );
      }
      if (errs.length) {
        notifyError(errs.map((e) => e.message).filter(Boolean).join(" · ") || "Some returns failed.");
      }
      onApproved?.();
      await load();
      setTab("performed");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to approve returns.");
    } finally {
      setBusy(null);
    }
  };

  const reject = async (reason) => {
    const ids = [...selected];
    if (!ids.length) {
      notifyError("Select at least one return to reject.");
      return;
    }
    setBusy("reject");
    try {
      const res = await apiRequest("/sales/mobile-orders/reject-returns", {
        method: "POST",
        body: { return_ids: ids, reason, ...listFilterBody({ cashierId, routeId }) },
        loading: false,
      });
      const count = Number(res?.rejected_count ?? 0);
      const errs = Array.isArray(res?.errors) ? res.errors : [];
      if (count > 0) {
        notifySuccess(count === 1 ? "1 return rejected." : `${count} returns rejected.`);
      }
      if (errs.length) {
        notifyError(errs.map((e) => e.message).filter(Boolean).join(" · ") || "Some returns failed.");
      }
      setRejectOpen(false);
      onApproved?.();
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to reject returns.");
    } finally {
      setBusy(null);
    }
  };

  const scopeHint = filterScopeHint({ fromDate, toDate, cashierId, routeId });

  return (
    <>
    <ModalShell
      open={open}
      title="Returns"
      onClose={onClose}
      busy={Boolean(busy)}
      widthClass="max-w-2xl"
      footer={
        tab === "pending" ? (
          <PendingDecisionFooter
            busy={busy}
            loading={loading}
            selectedCount={selected.size}
            onClose={onClose}
            onReject={() => setRejectOpen(true)}
            onApprove={() => void approve()}
            approveLabel="Approve returns"
            rejectLabel="Reject returns"
          />
        ) : (
          <button type="button" className={SECONDARY_BTN_CLASS} disabled={Boolean(busy)} onClick={onClose}>
            Close
          </button>
        )
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("performed")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            tab === "performed"
              ? "bg-[var(--theme-primary)] text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          View returns performed
          {!loading ? ` (${performed.length})` : ""}
        </button>
        <button
          type="button"
          onClick={() => setTab("pending")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            tab === "pending"
              ? "bg-[var(--theme-primary)] text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          Pending
          {!loading ? ` (${pending.length})` : ""}
        </button>
      </div>

      {tab === "performed" ? (
        <>
          <p className="mb-3 text-slate-500">Approved mobile returns for {scopeHint}.</p>
          {loading ? (
            <p className="text-slate-500">Loading returns…</p>
          ) : performed.length === 0 ? (
            <p className="text-slate-500">No returns performed for this filter.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Return</th>
                    <th className="px-3 py-2">Order</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Items</th>
                    <th className="px-3 py-2">Approved</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {performed.map((row) => {
                    const itemSummary = returnItemSummary(row);
                    return (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium text-slate-900">
                          {row.return_no ?? `#${row.id}`}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {row.sale ? formatReceiptNumber(row.sale) : "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {saleCustomerLabel(row.sale ?? row)}
                        </td>
                        <td className="max-w-[12rem] truncate px-3 py-2 text-slate-600" title={itemSummary}>
                          {itemSummary || "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                          {formatWhen(row.approved_at)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                          {formatSaleKes(row.total_amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : loading ? (
        <p className="text-slate-500">Loading pending returns…</p>
      ) : pending.length === 0 ? (
        <p className="text-slate-500">No pending mobile returns for this filter.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-10 px-3 py-2" />
                <th className="px-3 py-2">Return</th>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Items</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((row) => {
                const itemSummary = returnItemSummary(row);
                return (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggle(row.id)}
                        disabled={busy}
                        aria-label={`Select return ${row.return_no ?? row.id}`}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-900">
                      {row.return_no ?? `#${row.id}`}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {row.sale ? formatReceiptNumber(row.sale) : "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {saleCustomerLabel(row.sale ?? row)}
                    </td>
                    <td className="max-w-[12rem] truncate px-3 py-2 text-slate-600" title={itemSummary}>
                      {itemSummary || "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                      {formatSaleKes(row.total_amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ModalShell>
    <ActionRequestRejectionDialog
      open={rejectOpen}
      busy={busy === "reject"}
      title="Reject returns"
      description={
        selected.size === 1
          ? "Enter a reason for rejecting this return."
          : `Enter a reason for rejecting ${selected.size} selected returns.`
      }
      onSubmit={(reason) => void reject(reason)}
      onCancel={() => {
        if (busy !== "reject") setRejectOpen(false);
      }}
    />
    </>
  );
}

function expenseRepLabel(row) {
  return row?.user?.full_name || row?.user?.username || "Rep";
}

function ExpensesModal({
  open,
  onClose,
  onApproved,
  fromDate = "",
  toDate = "",
  cashierId = "",
  routeId = "",
}) {
  const [tab, setTab] = useState("performed");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [performed, setPerformed] = useState([]);
  const [pending, setPending] = useState([]);
  const [selected, setSelected] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = listFilterQuery({ fromDate, toDate, cashierId, routeId });

      const [performedRes, pendingRes] = await loadPerformedAndPending(
        `/sales/mobile-orders/performed-expenses${query}`,
        `/sales/mobile-orders/pending-expenses${query}`,
        "Expense approval is not available on this server yet. Deploy the latest API, then try again.",
      );
      const performedRows = Array.isArray(performedRes?.data) ? performedRes.data : [];
      const pendingRows = Array.isArray(pendingRes?.data) ? pendingRes.data : [];
      setPerformed(performedRows);
      setPending(pendingRows);
      setSelected(new Set(pendingRows.map((r) => r.id)));
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load expenses.");
      setPerformed([]);
      setPending([]);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }, [cashierId, fromDate, routeId, toDate]);

  useEffect(() => {
    if (!open) {
      setRejectOpen(false);
      return;
    }
    setTab("performed");
    void load();
  }, [load, open]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const approve = async () => {
    const ids = [...selected];
    if (!ids.length) {
      notifyError("Select at least one expense to approve.");
      return;
    }
    setBusy("approve");
    try {
      const res = await apiRequest("/sales/mobile-orders/approve-expenses", {
        method: "POST",
        body: { expense_ids: ids, ...listFilterBody({ cashierId, routeId }) },
        loading: false,
      });
      const count = Number(res?.approved_count ?? 0);
      const errs = Array.isArray(res?.errors) ? res.errors : [];
      if (count > 0) {
        notifySuccess(
          count === 1
            ? "1 expense approved — deducted from that day’s sales."
            : `${count} expenses approved — deducted from those days’ sales.`,
        );
      }
      if (errs.length) {
        notifyError(errs.map((e) => e.message).filter(Boolean).join(" · ") || "Some expenses failed.");
      }
      onApproved?.();
      await load();
      setTab("performed");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to approve expenses.");
    } finally {
      setBusy(null);
    }
  };

  const reject = async (reason) => {
    const ids = [...selected];
    if (!ids.length) {
      notifyError("Select at least one expense to reject.");
      return;
    }
    setBusy("reject");
    try {
      const res = await apiRequest("/sales/mobile-orders/reject-expenses", {
        method: "POST",
        body: { expense_ids: ids, reason, ...listFilterBody({ cashierId, routeId }) },
        loading: false,
      });
      const count = Number(res?.rejected_count ?? 0);
      const errs = Array.isArray(res?.errors) ? res.errors : [];
      if (count > 0) {
        notifySuccess(count === 1 ? "1 expense rejected." : `${count} expenses rejected.`);
      }
      if (errs.length) {
        notifyError(errs.map((e) => e.message).filter(Boolean).join(" · ") || "Some expenses failed.");
      }
      setRejectOpen(false);
      onApproved?.();
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to reject expenses.");
    } finally {
      setBusy(null);
    }
  };

  const scopeHint = filterScopeHint({ fromDate, toDate, cashierId, routeId });

  return (
    <>
    <ModalShell
      open={open}
      title="Expenses"
      onClose={onClose}
      busy={Boolean(busy)}
      widthClass="max-w-2xl"
      footer={
        tab === "pending" ? (
          <PendingDecisionFooter
            busy={busy}
            loading={loading}
            selectedCount={selected.size}
            onClose={onClose}
            onReject={() => setRejectOpen(true)}
            onApprove={() => void approve()}
            approveLabel="Approve expenses"
            rejectLabel="Reject expenses"
          />
        ) : (
          <button type="button" className={SECONDARY_BTN_CLASS} disabled={Boolean(busy)} onClick={onClose}>
            Close
          </button>
        )
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("performed")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            tab === "performed"
              ? "bg-[var(--theme-primary)] text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          View expenses
          {!loading ? ` (${performed.length})` : ""}
        </button>
        <button
          type="button"
          onClick={() => setTab("pending")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            tab === "pending"
              ? "bg-[var(--theme-primary)] text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          Pending
          {!loading ? ` (${pending.length})` : ""}
        </button>
      </div>

      {tab === "performed" ? (
        <>
          <p className="mb-3 text-slate-500">
            Approved route expenses for {scopeHint}. Amounts are deducted from that rep’s sales on the expense date.
          </p>
          {loading ? (
            <p className="text-slate-500">Loading expenses…</p>
          ) : performed.length === 0 ? (
            <p className="text-slate-500">No approved expenses for this filter.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Rep</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2">Approved</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {performed.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-900">{expenseRepLabel(row)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-700">{row.expense_date || "—"}</td>
                      <td className="max-w-[14rem] truncate px-3 py-2 text-slate-600" title={row.description}>
                        {row.description || "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatWhen(row.approved_at)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                        {formatSaleKes(row.expense_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : loading ? (
        <p className="text-slate-500">Loading pending expenses…</p>
      ) : pending.length === 0 ? (
        <p className="text-slate-500">No pending route expenses for this filter.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-10 px-3 py-2" />
                <th className="px-3 py-2">Rep</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggle(row.id)}
                      disabled={busy}
                      aria-label={`Select expense ${row.id}`}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900">{expenseRepLabel(row)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{row.expense_date || "—"}</td>
                  <td className="max-w-[14rem] truncate px-3 py-2 text-slate-600" title={row.description}>
                    {row.description || "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                    {formatSaleKes(row.expense_amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ModalShell>
    <ActionRequestRejectionDialog
      open={rejectOpen}
      busy={busy === "reject"}
      title="Reject expenses"
      description={
        selected.size === 1
          ? "Enter a reason for rejecting this expense."
          : `Enter a reason for rejecting ${selected.size} selected expenses.`
      }
      onSubmit={(reason) => void reject(reason)}
      onCancel={() => {
        if (busy !== "reject") setRejectOpen(false);
      }}
    />
    </>
  );
}

function PaymentsChoiceModal({ open, onClose, unpaidCount, loading, onMarkAll, onSelectOrders }) {
  return (
    <ModalShell
      open={open}
      title="Mark orders as paid"
      onClose={onClose}
      busy={loading}
      footer={
        <button type="button" className={SECONDARY_BTN_CLASS} disabled={loading} onClick={onClose}>
          Cancel
        </button>
      }
    >
      {loading ? (
        <p className="text-slate-500">Loading unpaid orders for this filter…</p>
      ) : (
        <>
          <p className="mb-4 text-slate-600">
            {unpaidCount === 0
              ? "There are no unpaid orders matching the current dates and filters."
              : unpaidCount === 1
                ? "1 unpaid order matching the current dates and filters."
                : `${unpaidCount} unpaid orders matching the current dates and filters.`}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={unpaidCount === 0}
              onClick={onMarkAll}
              className={`${CARD_CLASS} flex-1 disabled:opacity-50`}
            >
              <span className="text-sm font-semibold text-slate-900">Mark all as paid</span>
              <span className="text-xs text-slate-500">
                Convert every unpaid order in this filter (all pages)
              </span>
            </button>
            <button
              type="button"
              disabled={unpaidCount === 0}
              onClick={onSelectOrders}
              className={`${CARD_CLASS} flex-1 disabled:opacity-50`}
            >
              <span className="text-sm font-semibold text-slate-900">Select orders</span>
              <span className="text-xs text-slate-500">Choose which unpaid orders to mark paid</span>
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

function SelectPaidModal({ open, orders, onClose, onConfirm }) {
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(new Set((orders ?? []).map((o) => o.id)));
      setBusy(false);
    }
  }, [open, orders]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirm = async () => {
    const ids = [...selected];
    if (!ids.length) {
      notifyError("Select at least one order.");
      return;
    }
    setBusy(true);
    try {
      await onConfirm?.(ids);
      onClose?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      open={open}
      title="Select orders to mark as paid"
      onClose={onClose}
      busy={busy}
      widthClass="max-w-xl"
      footer={
        <>
          <button type="button" className={SECONDARY_BTN_CLASS} disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => void confirm()}
            className={PRIMARY_BTN}
          >
            {busy ? "Updating…" : "Mark selected as paid"}
          </button>
        </>
      }
    >
      {(orders ?? []).length === 0 ? (
        <p className="text-slate-500">No unpaid orders match the current dates and filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-10 px-3 py-2" />
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(orders ?? []).map((sale) => (
                <tr key={sale.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(sale.id)}
                      onChange={() => toggle(sale.id)}
                      disabled={busy}
                      aria-label={`Select order ${formatReceiptNumber(sale)}`}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900">{formatReceiptNumber(sale)}</td>
                  <td className="px-3 py-2 text-slate-700">{saleCustomerLabel(sale)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                    {formatSaleKes(sale.order_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ModalShell>
  );
}

/**
 * Platform-gated Returns + Payments + Expenses cards for the Mobile orders queue.
 * Off by default; enable per org under Platform → Sales.
 * Payments operate on all unpaid orders matching the list filters (all pages).
 */
export function MobileOrdersQuickActions({
  enabledReturns = false,
  enabledPayments = false,
  enabledExpenses = false,
  unpaidHintCount = null,
  loadUnpaidOrders,
  pageOrders = [],
  fromDate = "",
  toDate = "",
  cashierId = "",
  routeId = "",
  onDone,
}) {
  const [returnsOpen, setReturnsOpen] = useState(false);
  const [expensesOpen, setExpensesOpen] = useState(false);
  const [paymentsChoiceOpen, setPaymentsChoiceOpen] = useState(false);
  const [selectPaidOpen, setSelectPaidOpen] = useState(false);
  const [markBusy, setMarkBusy] = useState(false);
  const [unpaidLoading, setUnpaidLoading] = useState(false);
  const [unpaid, setUnpaid] = useState([]);

  const fallbackUnpaid = useMemo(() => unpaidOrdersOnPage(pageOrders), [pageOrders]);
  const hintCount =
    unpaidHintCount != null && Number.isFinite(Number(unpaidHintCount))
      ? Number(unpaidHintCount)
      : fallbackUnpaid.length;

  if (!enabledReturns && !enabledPayments && !enabledExpenses) return null;

  const resolveUnpaid = async () => {
    if (typeof loadUnpaidOrders !== "function") {
      setUnpaid(fallbackUnpaid);
      return fallbackUnpaid;
    }
    setUnpaidLoading(true);
    try {
      const rows = await loadUnpaidOrders();
      const list = Array.isArray(rows) ? rows : [];
      setUnpaid(list);
      return list;
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load unpaid orders.");
      setUnpaid([]);
      return [];
    } finally {
      setUnpaidLoading(false);
    }
  };

  const openPayments = async () => {
    setPaymentsChoiceOpen(true);
    await resolveUnpaid();
  };

  const markPaid = async (saleIds) => {
    if (!saleIds?.length) return;
    setMarkBusy(true);
    try {
      const res = await apiRequest("/sales/mobile-orders/mark-paid", {
        method: "POST",
        body: { sale_ids: saleIds, ...listFilterBody({ cashierId, routeId }) },
        loading: false,
      });
      const count = Number(res?.updated_count ?? 0);
      const errs = Array.isArray(res?.errors) ? res.errors : [];
      if (count > 0) {
        notifySuccess(count === 1 ? "1 order marked as paid." : `${count} orders marked as paid.`);
      } else if (!errs.length) {
        notifySuccess("No orders needed updating.");
      }
      if (errs.length) {
        notifyError(errs.map((e) => e.message).filter(Boolean).join(" · ") || "Some orders failed.");
      }
      onDone?.();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to mark orders as paid.");
      throw e;
    } finally {
      setMarkBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-stretch justify-end gap-2">
        {enabledReturns ? (
          <button type="button" className={CARD_CLASS} onClick={() => setReturnsOpen(true)}>
            <span className="text-sm font-semibold text-slate-900">Returns</span>
            <span className="text-xs text-slate-500">View returns performed</span>
          </button>
        ) : null}
        {enabledExpenses ? (
          <button type="button" className={CARD_CLASS} onClick={() => setExpensesOpen(true)}>
            <span className="text-sm font-semibold text-slate-900">Expenses</span>
            <span className="text-xs text-slate-500">View & approve route expenses</span>
          </button>
        ) : null}
        {enabledPayments ? (
          <button
            type="button"
            className={CARD_CLASS}
            disabled={markBusy}
            onClick={() => void openPayments()}
          >
            <span className="text-sm font-semibold text-slate-900">Payments</span>
            <span className="text-xs text-slate-500">
              {hintCount === 0
                ? "No unpaid in filter"
                : hintCount === 1
                  ? "1 unpaid · mark paid"
                  : `${hintCount} unpaid · mark paid`}
            </span>
          </button>
        ) : null}
      </div>

      <ReturnsModal
        open={returnsOpen}
        onClose={() => setReturnsOpen(false)}
        onApproved={onDone}
        fromDate={fromDate}
        toDate={toDate}
        cashierId={cashierId}
        routeId={routeId}
      />

      <ExpensesModal
        open={expensesOpen}
        onClose={() => setExpensesOpen(false)}
        onApproved={onDone}
        fromDate={fromDate}
        toDate={toDate}
        cashierId={cashierId}
        routeId={routeId}
      />

      <PaymentsChoiceModal
        open={paymentsChoiceOpen}
        unpaidCount={unpaidLoading ? hintCount : unpaid.length}
        loading={unpaidLoading}
        onClose={() => setPaymentsChoiceOpen(false)}
        onMarkAll={() => {
          setPaymentsChoiceOpen(false);
          void markPaid(unpaid.map((s) => s.id)).catch(() => {});
        }}
        onSelectOrders={() => {
          setPaymentsChoiceOpen(false);
          setSelectPaidOpen(true);
        }}
      />

      <SelectPaidModal
        open={selectPaidOpen}
        orders={unpaid}
        onClose={() => setSelectPaidOpen(false)}
        onConfirm={markPaid}
      />
    </>
  );
}
