"use client";

import { useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { P } from "@/lib/permission-codes";
import { runLpoPrintClick } from "@/components/lpo/lpo-order-print";
import { formatLpoKes, lpoCanDelete, lpoCanEdit, lpoDisplayNumber } from "./lpo-shared";

function normalizePhone(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits;
}

function buildWhatsAppText(lpo) {
  const po = lpoDisplayNumber(lpo);
  const total = formatLpoKes(lpo.net_amount);
  return [
    `Purchase order ${po}`,
    lpo.supplier_name ? `Supplier: ${lpo.supplier_name}` : null,
    lpo.due_date ? `Valid until: ${lpo.due_date}` : null,
    `Total: ${total}`,
    "",
    "Please see the attached LPO PDF. Use Print LPO to save a copy for WhatsApp, then forward it here.",
  ]
    .filter(Boolean)
    .join("\n");
}

function useLpoPrintActions(lpoNo, printContext = {}) {
  const { user, capabilities, organization } = useAuth();
  const [printing, setPrinting] = useState(null);
  const [printError, setPrintError] = useState(null);

  async function printDocument(variant = "lpo") {
    setPrinting(variant);
    setPrintError(null);
    try {
      await runLpoPrintClick(lpoNo, {
        variant,
        user,
        capabilities,
        organization,
        lpoSummary: printContext.lpoSummary,
        supplier: printContext.supplier,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not print document";
      setPrintError(message);
    } finally {
      setPrinting(null);
    }
  }

  return { printing, printError, printDocument };
}

export function LpoWorkflowPanel({ lpo, lpoNo, onUpdated, printContext = null }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [awaitingMarkSent, setAwaitingMarkSent] = useState(false);
  const { hasPermission } = useAuth();
  const canApprove = hasPermission(P.purchasing.lpo.approve);
  const canView = hasPermission(P.purchasing.lpo.view);
  const { printing, printError, printDocument } = useLpoPrintActions(lpoNo, printContext);

  const actions = (lpo.workflow_actions ?? []).filter((action) => {
    if (action === "mark_checked" || action === "approve") {
      return canApprove;
    }
    return canView;
  });

  async function runAction(action) {
    setBusy(action);
    setError(null);
    try {
      await apiRequest(`/lpo-mst/${lpoNo}/workflow`, {
        method: "POST",
        body: { action },
      });
      setAwaitingMarkSent(false);
      await onUpdated?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  function openEmail() {
    const to = lpo.supplier_email?.trim();
    const subject = encodeURIComponent(`LPO ${lpoDisplayNumber(lpo)}`);
    const body = encodeURIComponent(buildWhatsAppText(lpo));
    window.location.href = `mailto:${to || ""}?subject=${subject}&body=${body}`;
    setAwaitingMarkSent(true);
  }

  async function openWhatsApp() {
    const text = encodeURIComponent(buildWhatsAppText(lpo));
    const phone = normalizePhone(lpo.supplier_phone);
    const url = phone
      ? `https://wa.me/${phone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, "_blank", "noopener,noreferrer");
    await printDocument("lpo");
    setAwaitingMarkSent(true);
  }

  if (!actions.length && !awaitingMarkSent) {
    return null;
  }

  return (
    <section className="theme-panel rounded-xl border border-[var(--theme-primary)]/30 bg-[var(--theme-primary-muted)] p-6 shadow-sm">
      <h2 className="theme-heading mb-1 text-sm font-semibold">LPO workflow</h2>
      <p className="theme-subtext mb-4 text-xs">
        Move this order through check → approval → send to supplier → receive stock. Status becomes
        LPO Cleared automatically when a supplier payment is recorded (partial or full).
      </p>

      {error || printError ? (
        <p className="theme-alert-error mb-3 rounded-lg px-3 py-2 text-sm">
          {error ?? printError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {actions.includes("mark_checked") ? (
          <ActionButton
            label={busy === "mark_checked" ? "Saving…" : "Mark as checked"}
            onClick={() => runAction("mark_checked")}
            disabled={Boolean(busy) || Boolean(printing)}
          />
        ) : null}
        {actions.includes("approve") ? (
          <ActionButton
            label={busy === "approve" ? "Saving…" : "Approve LPO"}
            onClick={() => runAction("approve")}
            disabled={Boolean(busy) || Boolean(printing)}
            primary
          />
        ) : null}
        {actions.includes("send_email") || actions.includes("send_whatsapp") ? (
          <>
            <ActionButton
              label={printing === "lpo" ? "Printing…" : "Print LPO"}
              onClick={() => printDocument("lpo")}
              disabled={Boolean(busy) || Boolean(printing)}
            />
            {actions.includes("send_email") ? (
              <ActionButton
                label="Send via Email"
                onClick={openEmail}
                disabled={Boolean(busy) || Boolean(printing)}
              />
            ) : null}
            {actions.includes("send_whatsapp") ? (
              <ActionButton
                label="Send via WhatsApp"
                onClick={openWhatsApp}
                disabled={Boolean(busy) || Boolean(printing)}
                primary
              />
            ) : null}
          </>
        ) : null}
      </div>

      {awaitingMarkSent || (actions.includes("mark_sent") && canView) ? (
        <div className="mt-4 rounded-lg border border-[var(--theme-accent-orange)]/35 bg-[color-mix(in_srgb,var(--theme-accent-orange)_10%,var(--theme-page-bg))] px-4 py-3">
          <p className="text-sm text-[var(--theme-accent-text)]">
            After you send the LPO (email or WhatsApp), you must confirm it was sent to the
            supplier. Use Print LPO to save a copy for WhatsApp.
          </p>
          <button
            type="button"
            disabled={busy === "mark_sent" || Boolean(printing)}
            onClick={() => runAction("mark_sent")}
            className="theme-accent-btn animate-lpo-blink mt-3 rounded-lg px-5 py-2.5 text-sm font-semibold shadow-md disabled:opacity-50"
          >
            {busy === "mark_sent" ? "Saving…" : "Mark as sent to supplier"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ActionButton({ label, onClick, disabled, primary }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        primary
          ? "theme-primary-btn rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          : "theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
      }
    >
      {label}
    </button>
  );
}

export function LpoDetailActions({ lpo, lpoNo, onDelete, deleting, printContext = null }) {
  const { hasPermission } = useAuth();
  const canView = hasPermission(P.purchasing.lpo.view);
  const canEdit = hasPermission(P.purchasing.lpo.edit) && lpoCanEdit(lpo);
  const canDelete = hasPermission(P.purchasing.lpo.delete) && lpoCanDelete(lpo);
  const { printing, printError, printDocument } = useLpoPrintActions(lpoNo, printContext);

  return (
    <div className="flex flex-col gap-2">
      {printError ? (
        <p className="theme-alert-error rounded-lg px-3 py-2 text-sm">{printError}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {canEdit ? (
          <Link
            href={`/lpo/${lpoNo}/edit`}
            className="theme-secondary-btn rounded-lg px-3 py-1.5 text-sm font-medium"
          >
            Edit
          </Link>
        ) : null}
        {canDelete ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting || Boolean(printing)}
            className="theme-secondary-btn rounded-lg border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        ) : null}
        {lpo.lpo_status_code >= 3 ? (
          <>
            {lpo.can_receive !== false ? (
              <Link
                href={`/lpo/${lpoNo}/receive`}
                className="theme-secondary-btn rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--theme-primary)]"
              >
                Receive stock
              </Link>
            ) : (
              <span
                className="theme-secondary-btn cursor-not-allowed rounded-lg px-3 py-1.5 text-sm font-medium opacity-50"
                title="All items were returned to the supplier"
              >
                Receive stock
              </span>
            )}
            {lpo.can_create_return !== false ? (
              <Link
                href={`/lpo/${lpoNo}/supplier-return`}
                className="theme-accent-btn rounded-lg px-3 py-1.5 text-sm font-medium"
              >
                Supplier return
              </Link>
            ) : (
              <span
                className="theme-secondary-btn cursor-not-allowed rounded-lg px-3 py-1.5 text-sm font-medium opacity-40"
                title="No items available to return"
              >
                Supplier return
              </span>
            )}
          </>
        ) : null}
        {lpo.can_pay ? (
          <Link
            href={`/suppliers/payments/new?supplier_id=${lpo.supplier_id}&lpo_no=${lpoNo}`}
            className="theme-primary-btn rounded-lg px-3 py-1.5 text-sm font-medium"
          >
            Record payment
          </Link>
        ) : (
          <span className="theme-secondary-btn cursor-not-allowed rounded-lg px-3 py-1.5 text-sm font-medium opacity-50">
            Record payment
          </span>
        )}
        {canView ? (
          <>
            <button
              type="button"
              onClick={() => printDocument("lpo")}
              disabled={Boolean(printing)}
              className="theme-secondary-btn rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {printing === "lpo" ? "Printing…" : "Print LPO"}
            </button>
            <button
              type="button"
              onClick={() => printDocument("delivery_note")}
              disabled={Boolean(printing)}
              className="theme-secondary-btn rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {printing === "delivery_note" ? "Printing…" : "Delivery note"}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
