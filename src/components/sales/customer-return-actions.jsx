"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { PencilIcon, TrashIcon, inputClassName } from "@/components/catalog/catalog-shared";
import { normalizeReturnStatus } from "@/components/sales/customer-returns-shared";

function CheckCircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function XCircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function PrintIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

function IconActionButton({ label, onClick, disabled, className, children }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md p-1.5 transition-colors disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

export function resolveCustomerReturnActionFlags(row, canManage = false) {
  const status = normalizeReturnStatus(row?.status);
  const pending = status === "pending";
  const approved = status === "approved";

  return {
    can_approve: row?.can_approve ?? (pending && canManage),
    can_reject: row?.can_reject ?? ((pending || approved) && canManage),
    can_delete: row?.can_delete ?? canManage,
    can_edit: row?.can_edit ?? (pending && canManage),
    can_print: row?.can_print ?? true,
  };
}

export function CustomerReturnActionDialog({
  open,
  type,
  row,
  rejectReason,
  onRejectReasonChange,
  saving,
  error,
  onClose,
  onConfirm,
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted || !row) return null;

  const approved = normalizeReturnStatus(row.status) === "approved";
  const returnNo = row.return_no ?? `#${row.id}`;

  const config =
    type === "approve"
      ? {
          title: "Approve customer return?",
          message: `Approve ${returnNo}? Stock will be restocked, the order adjusted, and a credit note issued.`,
          confirmLabel: "Approve return",
          confirmClass: "bg-emerald-600 hover:bg-emerald-700 text-white",
        }
      : type === "reject"
        ? {
            title: approved ? "Reject approved return?" : "Reject customer return?",
            message: approved
              ? `Reject ${returnNo}? Restocked quantities and order adjustments will be reversed.`
              : `Reject ${returnNo}? No stock or order changes will be applied.`,
            confirmLabel: "Reject return",
            confirmClass: "bg-red-600 hover:bg-red-700 text-white",
          }
        : type === "delete"
          ? {
              title: approved ? "Delete approved return?" : "Delete customer return?",
              message: approved
                ? `Delete ${returnNo}? Restocked quantities will be reversed. This cannot be undone.`
                : `Delete ${returnNo}? This cannot be undone.`,
              confirmLabel: "Delete return",
              confirmClass: "bg-red-600 hover:bg-red-700 text-white",
            }
          : null;

  if (!config) return null;

  const rejectInvalid = type === "reject" && rejectReason.trim().length < 3;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-return-action-dialog-title"
        className="w-full max-w-md theme-panel rounded-xl border p-5 shadow-xl"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !saving) onClose();
        }}
      >
        <h2 id="customer-return-action-dialog-title" className="text-[15px] font-medium text-slate-900">
          {config.title}
        </h2>
        <p className="mt-2 text-sm text-slate-600">{config.message}</p>

        {type === "reject" ? (
          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Reason for rejection (required)
            </span>
            <textarea
              rows={3}
              className={inputClassName()}
              value={rejectReason}
              onChange={(e) => onRejectReasonChange(e.target.value)}
              placeholder="Explain why this return is rejected"
            />
          </label>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        <div className="mt-4 flex gap-2 border-t border-slate-200 pt-3">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || rejectInvalid}
            onClick={onConfirm}
            className={`flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-50 ${config.confirmClass}`}
          >
            {saving ? "Working…" : config.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function CustomerReturnRowActions({ row, busyId, canManage, onRequestAction, onPrint }) {
  const flags = resolveCustomerReturnActionFlags(row, canManage);
  const disabled = busyId === row.id;
  const approved = normalizeReturnStatus(row.status) === "approved";
  const hasActions =
    flags.can_approve || flags.can_reject || flags.can_delete || flags.can_edit || flags.can_print;

  if (!hasActions) {
    return <span className="text-xs text-slate-400">—</span>;
  }

  return (
    <div className="flex items-center justify-end gap-0.5">
      {flags.can_print ? (
        <IconActionButton
          label={approved ? "Print credit note" : "Print return"}
          disabled={disabled}
          onClick={() => onPrint?.(row)}
          className="text-slate-700 hover:bg-slate-100"
        >
          <PrintIcon />
        </IconActionButton>
      ) : null}
      {flags.can_approve ? (
        <IconActionButton
          label="Approve return"
          disabled={disabled}
          onClick={() => onRequestAction("approve", row)}
          className="text-emerald-700 hover:bg-emerald-50"
        >
          <CheckCircleIcon />
        </IconActionButton>
      ) : null}
      {flags.can_reject ? (
        <IconActionButton
          label={approved ? "Reject (undo approval)" : "Reject return"}
          disabled={disabled}
          onClick={() => onRequestAction("reject", row)}
          className="text-red-700 hover:bg-red-50"
        >
          <XCircleIcon />
        </IconActionButton>
      ) : null}
      {flags.can_edit ? (
        <Link
          href={`/sales/returns/${row.id}/edit`}
          title="Edit return"
          aria-label="Edit return"
          className="rounded-md p-1.5 text-[#185FA5] transition-colors hover:bg-[#E6F1FB]"
        >
          <PencilIcon />
        </Link>
      ) : null}
      {flags.can_delete ? (
        <IconActionButton
          label="Delete return"
          disabled={disabled}
          onClick={() => onRequestAction("delete", row)}
          className="text-slate-600 hover:bg-slate-100"
        >
          <TrashIcon />
        </IconActionButton>
      ) : null}
    </div>
  );
}
