"use client";

import { OrderContextMenu } from "@/components/sales/sales-orders-shared";
import { P } from "@/lib/permission-codes";
import { useAuth } from "@/contexts/auth-context";
import { lpoCanDelete, lpoCanEdit } from "./lpo-shared";

function ViewIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PrintIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v8H6z" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
    </svg>
  );
}

export function buildLpoListMenuItems({
  row,
  canView,
  canEdit,
  canDelete,
  busy,
  onView,
  onPrintLpo,
  onPrintDeliveryNote,
  onEdit,
  onDelete,
}) {
  const items = [];

  if (canView) {
    items.push({ key: "view", label: "View purchase order", icon: "view", onClick: onView });
    items.push({ key: "print-lpo", label: "Print LPO", icon: "print", onClick: onPrintLpo });
    items.push({
      key: "print-dn",
      label: "Print delivery note",
      icon: "print",
      onClick: onPrintDeliveryNote,
    });
  }

  if (canEdit && lpoCanEdit(row)) {
    if (items.length) items.push({ type: "separator" });
    items.push({ key: "edit", label: "Edit LPO", icon: "advance", onClick: onEdit });
  }

  if (canDelete && lpoCanDelete(row)) {
    items.push({
      key: "delete",
      label: busy ? "Deleting…" : "Delete LPO",
      icon: "cancel",
      destructive: true,
      disabled: busy,
      onClick: onDelete,
    });
  }

  return items;
}

export function LpoListRowActions({
  row,
  busy = false,
  printing = false,
  onView,
  onPrintLpo,
  onOpenMenu,
}) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onView?.();
        }}
        className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        aria-label="View purchase order"
      >
        <ViewIcon />
      </button>
      <button
        type="button"
        disabled={printing}
        onClick={(event) => {
          event.stopPropagation();
          onPrintLpo?.();
        }}
        className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
        aria-label="Print LPO"
      >
        <PrintIcon />
      </button>
      <button
        type="button"
        disabled={busy || printing}
        onClick={(event) => {
          event.stopPropagation();
          onOpenMenu?.(event);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
        aria-label="More actions"
      >
        <MoreIcon />
      </button>
    </div>
  );
}

export function useLpoListPermissions() {
  const { hasPermission } = useAuth();

  return {
    canView: hasPermission(P.purchasing.lpo.view),
    canCreate: hasPermission(P.purchasing.lpo.create),
    canEdit: hasPermission(P.purchasing.lpo.edit),
    canDelete: hasPermission(P.purchasing.lpo.delete),
    canApprove: hasPermission(P.purchasing.lpo.approve),
  };
}

export function LpoListContextMenu(props) {
  return <OrderContextMenu {...props} />;
}
