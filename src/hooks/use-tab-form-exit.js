"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTabWorkspace, useTabTitle } from "@/contexts/tab-workspace-context";

/** First whitespace-separated token of a record name (for short tab labels). */
export function tabNameFirstWord(recordName) {
  const name = String(recordName ?? "").trim();
  if (!name) return "";
  return name.split(/\s+/)[0];
}

function titleCaseEntity(entityLabel) {
  const entity = String(entityLabel ?? "").trim();
  if (!entity) return "";
  return entity.replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Tab title for create forms, e.g. "Add product". */
export function tabAddTitle(entityLabel) {
  const label = String(entityLabel ?? "").trim();
  if (!label) return "Add";
  return /^add\s/i.test(label) ? label : `Add ${label}`;
}

/**
 * Tab title for detail/profile pages, e.g. "Product - ABABIL".
 * Uses the entity type + the first word of the record name.
 */
export function tabDetailTitle(entityLabel, recordName) {
  const entity = titleCaseEntity(entityLabel);
  const first = tabNameFirstWord(recordName);
  if (!entity) return first || "Details";
  return first ? `${entity} - ${first}` : entity;
}

/** Tab title for edit forms, e.g. "Edit Product - ABABIL". */
export function tabEditTitle(entityLabel, recordName) {
  const entity = String(entityLabel ?? "").trim();
  const first = tabNameFirstWord(recordName);
  if (!entity) return first ? `Edit - ${first}` : "Edit";
  const base = /^edit\s/i.test(entity) ? entity : `Edit ${entity}`;
  return first ? `${base} - ${first}` : base;
}

/**
 * Set workspace tab title and navigate away while closing the current form tab.
 * Used on Add/Edit screens so Save and Cancel do not leave stale tabs open.
 */
export function useTabFormExit(tabTitle, options = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const targetHref = options.href ?? pathname;
  const { enabled, closeTab, clearTabDirty } = useTabWorkspace();

  useTabTitle(tabTitle || null, targetHref);

  const exitTo = useCallback(
    (nextHref) => {
      if (!nextHref) return;
      if (enabled) clearTabDirty(targetHref);
      router.push(nextHref);
      if (enabled) {
        window.setTimeout(() => closeTab(targetHref), 0);
      }
    },
    [clearTabDirty, closeTab, enabled, router, targetHref],
  );

  return { exitTo, enabled, pathname: targetHref };
}
