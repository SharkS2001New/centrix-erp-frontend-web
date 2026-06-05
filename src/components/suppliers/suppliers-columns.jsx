"use client";

import Link from "next/link";
import { formatShortDate } from "@/components/catalog/catalog-shared";
import { SupplierStatusBadge, formatSupplierKes } from "./suppliers-shared";

export const COLUMN_STORAGE_KEY = "pos-erp-suppliers-visible-columns";

const REMOVED_COLUMN_IDS = new Set([
  "supplier_code",
  "organization",
  "additional_info",
  "credit_limit",
  "opening_balance",
  "contacts",
]);

export const SUPPLIER_COLUMNS = [
  { id: "supplier_name", label: "Supplier", defaultVisible: true, required: true },
  { id: "contact_person", label: "Contact", defaultVisible: true },
  { id: "email", label: "Email", defaultVisible: false },
  { id: "phone", label: "Phone", defaultVisible: true },
  { id: "alternate_phone", label: "Alt. phone", defaultVisible: false },
  { id: "address", label: "Address", defaultVisible: false },
  { id: "town", label: "Town", defaultVisible: false },
  { id: "tax_pin", label: "KRA PIN", defaultVisible: false },
  {
    id: "current_balance",
    label: "Amount owing",
    defaultVisible: true,
    align: "right",
    hint: "What you still owe this supplier (accounts payable).",
  },
  { id: "other_contacts", label: "Other contacts", defaultVisible: false },
  { id: "is_active", label: "Status", defaultVisible: true },
  { id: "created", label: "Created", defaultVisible: true },
  { id: "updated", label: "Updated", defaultVisible: false },
  { id: "actions", label: "Actions", defaultVisible: true, required: true, align: "center" },
];

export function defaultVisibleColumnIds() {
  return SUPPLIER_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id);
}

export function normalizeColumnIds(ids) {
  const valid = new Set(SUPPLIER_COLUMNS.map((c) => c.id));
  const normalized = (ids ?? [])
    .filter((id) => !REMOVED_COLUMN_IDS.has(id))
    .filter((id) => valid.has(id));
  for (const col of SUPPLIER_COLUMNS) {
    if (col.required && !normalized.includes(col.id)) normalized.push(col.id);
  }
  return normalized.length ? normalized : defaultVisibleColumnIds();
}

export function readStoredColumnIds() {
  if (typeof window === "undefined") return defaultVisibleColumnIds();
  try {
    const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!raw) return defaultVisibleColumnIds();
    return normalizeColumnIds(JSON.parse(raw));
  } catch {
    return defaultVisibleColumnIds();
  }
}

export function alignClass(align) {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

function UserDateCell({ name, date }) {
  return (
    <div>
      <p className="font-medium text-slate-800">{name || "—"}</p>
      <p className="text-xs text-slate-500">{formatShortDate(date)}</p>
    </div>
  );
}

function OtherContactsCell({ row, onOpen }) {
  const list = Array.isArray(row.contacts) ? row.contacts : [];
  if (!list.length) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      className="text-sm font-medium text-[#185FA5] hover:text-[#144f8a] hover:underline"
    >
      {list.length} contact{list.length === 1 ? "" : "s"}
    </button>
  );
}

export function enrichSupplier(supplier, userById) {
  const creator = userById.get(supplier.created_by);

  return {
    ...supplier,
    created_by_name: creator?.full_name ?? creator?.username ?? "—",
    updated_by_name: "—",
  };
}

export function renderSupplierCell(colId, row, handlers) {
  switch (colId) {
    case "supplier_name":
      return (
        <Link
          href={`/suppliers/${row.id}`}
          className="font-medium text-[#185FA5] hover:text-[#144f8a] hover:underline"
        >
          {row.supplier_name}
        </Link>
      );
    case "contact_person":
      return row.contact_person || "—";
    case "email":
      return row.email || "—";
    case "phone":
      return row.phone || "—";
    case "alternate_phone":
      return row.alternate_phone || "—";
    case "address":
      return (
        <span className="line-clamp-2 max-w-xs" title={row.address || undefined}>
          {row.address || "—"}
        </span>
      );
    case "town":
      return row.town || "—";
    case "tax_pin":
      return row.tax_pin || "—";
    case "current_balance":
      return (
        <span
          className={
            Number(row.current_balance ?? 0) > 0 ? "font-medium text-amber-700" : "text-slate-700"
          }
          title="Amount you owe this supplier"
        >
          {formatSupplierKes(row.current_balance)}
        </span>
      );
    case "other_contacts":
      return <OtherContactsCell row={row} onOpen={handlers.onOpenOtherContacts} />;
    case "is_active":
      return <SupplierStatusBadge active={row.is_active} />;
    case "created":
      return <UserDateCell name={row.created_by_name} date={row.created_at} />;
    case "updated":
      return <UserDateCell name={row.updated_by_name} date={row.updated_at} />;
    case "actions":
      return handlers.renderActions(row);
    default:
      return "—";
  }
}
