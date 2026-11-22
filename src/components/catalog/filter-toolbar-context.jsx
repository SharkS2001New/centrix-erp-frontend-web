"use client";

import { createContext, useContext } from "react";

export const FilterToolbarContext = createContext(false);
export const FilterFieldLabelContext = createContext(false);

export const FILTER_FIELD_LABEL_CLASS =
  "theme-subtext mb-1 block text-xs font-medium";

export function useShouldShowFilterLabel() {
  const inFilterToolbar = useContext(FilterToolbarContext);
  const hasFieldLabel = useContext(FilterFieldLabelContext);
  return inFilterToolbar && !hasFieldLabel;
}

export function inferFilterControlLabel({
  filterLabel,
  ariaLabel,
  placeholder,
  options,
  name,
  type,
}) {
  const explicitLabel = String(filterLabel ?? ariaLabel ?? "").trim();
  if (explicitLabel) return formatLabel(explicitLabel);

  const placeholderText = String(placeholder ?? "").trim();
  if (placeholderText && !isGenericPlaceholder(placeholderText)) {
    return formatLabel(placeholderText);
  }

  const firstOption = Array.isArray(options)
    ? options.find((option) => option && !option.isHeader && !option.groupHeader)
    : null;
  const optionText = String(firstOption?.label ?? "").trim();
  if (optionText && !isGenericPlaceholder(optionText)) {
    return formatLabel(optionText);
  }

  const nameText = String(name ?? "").trim();
  if (nameText) return formatLabel(nameText);
  if (type === "search") return "Search";
  if (type === "date") return "Date";
  if (type === "month") return "Month";
  return "Filter";
}

function isGenericPlaceholder(value) {
  return /^(?:[-—]\s*)?(?:all|any|select|choose)(?:\s*[-—])?$/i.test(value) ||
    /^(?:[-—]\s*)?(?:select|choose)(?:\s+.+)?(?:\s*[-—])?$/i.test(value);
}

function formatLabel(value) {
  const stripped = value
    .replace(/^(?:all|any)\s+/i, "")
    .replace(/^(?:select|choose)(?:\s+a)?\s+/i, "")
    .replace(/\s*(?:…|\.{3})$/, "")
    .trim();
  if (!stripped) return "Filter";

  const words = stripped.split(/\s+/);
  const last = words.at(-1).toLowerCase();
  const singularForms = {
    branches: "branch",
    cashiers: "cashier",
    categories: "category",
    customers: "customer",
    employees: "employee",
    invoices: "invoice",
    locations: "location",
    modules: "module",
    months: "month",
    orders: "order",
    products: "product",
    routes: "route",
    statuses: "status",
    subcategories: "subcategory",
    "sub-categories": "subcategory",
    suppliers: "supplier",
    types: "type",
    users: "user",
    warehouses: "warehouse",
  };
  if (singularForms[last]) words[words.length - 1] = singularForms[last];

  const label = words.join(" ");
  return label[0].toLocaleUpperCase() + label.slice(1);
}
