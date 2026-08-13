"use client";

import Link from "next/link";
import { PencilIcon } from "@/components/catalog/catalog-shared";
import { resolveCustomerReturnActionFlags } from "@/components/sales/customer-return-actions";

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

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
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

export function CreditNoteRowActions({ row, busyId, canManage, onRequestAction, onPrint }) {
  const flags = resolveCustomerReturnActionFlags(row, canManage);
  const disabled = busyId === row.id;
  const approved = String(row.status ?? "").toLowerCase() === "approved";

  return (
    <div className="flex items-center justify-end gap-0.5">
      {flags.can_print ? (
        <IconActionButton
          label="Print credit note"
          disabled={disabled}
          onClick={() => onPrint?.(row)}
          className="text-slate-700 hover:bg-slate-100"
        >
          <PrintIcon />
        </IconActionButton>
      ) : null}
      {flags.can_approve ? (
        <IconActionButton
          label="Approve credit note"
          disabled={disabled}
          onClick={() => onRequestAction("approve", row)}
          className="text-emerald-700 hover:bg-emerald-50"
        >
          <CheckCircleIcon />
        </IconActionButton>
      ) : null}
      {flags.can_reject ? (
        <IconActionButton
          label={approved ? "Reject (undo approval)" : "Reject credit note"}
          disabled={disabled}
          onClick={() => onRequestAction("reject", row)}
          className="text-red-700 hover:bg-red-50"
        >
          <XCircleIcon />
        </IconActionButton>
      ) : null}
      {flags.can_edit ? (
        <Link
          href={`/sales/credit-notes/${row.id}/edit`}
          title="Edit credit note"
          aria-label="Edit credit note"
          className="rounded-md p-1.5 text-[#185FA5] transition-colors hover:bg-[#E6F1FB]"
        >
          <PencilIcon />
        </Link>
      ) : null}
      {flags.can_delete ? (
        <IconActionButton
          label="Delete credit note"
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
