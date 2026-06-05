"use client";

import { useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { formatLpoKes, formatPoNumber } from "./lpo-shared";

function normalizePhone(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits;
}

function buildWhatsAppText(lpo) {
  const po = formatPoNumber(lpo.lpo_no);
  const total = formatLpoKes(lpo.net_amount);
  return [
    `Purchase order ${po}`,
    lpo.supplier_name ? `Supplier: ${lpo.supplier_name}` : null,
    lpo.due_date ? `Valid until: ${lpo.due_date}` : null,
    `Total: ${total}`,
    "",
    "Please see the attached LPO PDF. Open the print link on your device to save or share the PDF, then forward it here.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function LpoWorkflowPanel({ lpo, lpoNo, onUpdated }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [awaitingMarkSent, setAwaitingMarkSent] = useState(false);

  const actions = lpo.workflow_actions ?? [];

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

  function openPrintPdf() {
    window.open(`/lpo/${lpoNo}/print`, "_blank", "noopener,noreferrer");
  }

  function openEmail() {
    const to = lpo.supplier_email?.trim();
    const subject = encodeURIComponent(`LPO ${formatPoNumber(lpo.lpo_no)}`);
    const body = encodeURIComponent(buildWhatsAppText(lpo));
    window.location.href = `mailto:${to || ""}?subject=${subject}&body=${body}`;
    setAwaitingMarkSent(true);
  }

  function openWhatsApp() {
    const text = encodeURIComponent(buildWhatsAppText(lpo));
    const phone = normalizePhone(lpo.supplier_phone);
    const url = phone
      ? `https://wa.me/${phone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, "_blank", "noopener,noreferrer");
    openPrintPdf();
    setAwaitingMarkSent(true);
  }

  if (!actions.length && !awaitingMarkSent) {
    return null;
  }

  return (
    <section className="rounded-xl border border-[#185FA5]/30 bg-[#E6F1FB]/40 p-6 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold text-slate-900">LPO workflow</h2>
      <p className="mb-4 text-xs text-slate-600">
        Move this order through check → approval → send to supplier → receive stock. Status becomes
        LPO Cleared automatically when a supplier payment is recorded (partial or full).
      </p>

      {error ? (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {actions.includes("mark_checked") ? (
          <ActionButton
            label={busy === "mark_checked" ? "Saving…" : "Mark as checked"}
            onClick={() => runAction("mark_checked")}
            disabled={Boolean(busy)}
          />
        ) : null}
        {actions.includes("approve") ? (
          <ActionButton
            label={busy === "approve" ? "Saving…" : "Approve LPO"}
            onClick={() => runAction("approve")}
            disabled={Boolean(busy)}
            primary
          />
        ) : null}
        {actions.includes("send_email") || actions.includes("send_whatsapp") ? (
          <>
            <ActionButton
              label="Print / PDF"
              onClick={openPrintPdf}
              disabled={Boolean(busy)}
            />
            {actions.includes("send_email") ? (
              <ActionButton label="Send via Email" onClick={openEmail} disabled={Boolean(busy)} />
            ) : null}
            {actions.includes("send_whatsapp") ? (
              <ActionButton
                label="Send via WhatsApp"
                onClick={openWhatsApp}
                disabled={Boolean(busy)}
                primary
              />
            ) : null}
          </>
        ) : null}
      </div>

      {awaitingMarkSent || actions.includes("mark_sent") ? (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-950">
            After you send the LPO (email or WhatsApp), you must confirm it was sent to the
            supplier. Use Print / PDF to save a copy for WhatsApp.
          </p>
          <button
            type="button"
            disabled={busy === "mark_sent"}
            onClick={() => runAction("mark_sent")}
            className="animate-lpo-blink mt-3 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-amber-700 disabled:opacity-50"
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
          ? "rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a] disabled:opacity-50"
          : "rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
      }
    >
      {label}
    </button>
  );
}

export function LpoDetailActions({ lpo, lpoNo, onDelete, deleting }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {lpo.can_edit ? (
        <Link
          href={`/lpo/${lpoNo}/edit`}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Edit
        </Link>
      ) : null}
      {lpo.can_delete ? (
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      ) : null}
      {lpo.lpo_status_code >= 3 ? (
        <>
          {lpo.can_receive !== false ? (
            <Link
              href={`/lpo/${lpoNo}/receive`}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-[#185FA5] hover:bg-slate-50"
            >
              Receive stock
            </Link>
          ) : (
            <span
              className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-400"
              title="All items were returned to the supplier"
            >
              Receive stock
            </span>
          )}
          {lpo.can_create_return !== false ? (
            <Link
              href={`/lpo/${lpoNo}/supplier-return`}
              className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-sm font-medium text-orange-800 hover:bg-orange-100"
            >
              Supplier return
            </Link>
          ) : (
            <span
              className="cursor-not-allowed rounded-lg border border-orange-100 bg-orange-50/50 px-3 py-1.5 text-sm font-medium text-orange-300"
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
          className="rounded-lg bg-[#185FA5] px-3 py-1.5 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a]"
        >
          Record payment
        </Link>
      ) : (
        <span className="cursor-not-allowed rounded-lg bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-500">
          Record payment
        </span>
      )}
      <Link
        href={`/lpo/${lpoNo}/print`}
        target="_blank"
        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Print / PDF
      </Link>
    </div>
  );
}
