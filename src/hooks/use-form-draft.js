"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/auth-context";
import { clearFormDraft, getFormDraftStore } from "@/stores/form-drafts";

/**
 * Cheap structural equality for form drafts — avoids JSON.stringify on every keystroke.
 * Compares primitives by value (with string coercion for number/string mixes) and
 * walks plain objects/arrays recursively.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @param {{ ignoreKeys?: string[] }} [options]
 */
export function isFormValuesEqual(a, b, { ignoreKeys = [] } = {}) {
  if (a === b) return true;
  if (a == null || b == null) return a == b;
  if (typeof a !== "object" || typeof b !== "object") {
    return a === b || String(a ?? "") === String(b ?? "");
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!isFormValuesEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const ignore = ignoreKeys.length ? new Set(ignoreKeys) : null;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (ignore?.has(key)) continue;
    if (!isFormValuesEqual(a[key], b[key])) return false;
  }
  return true;
}

/**
 * Persist a form's JSON state across route/tab switches and browser refresh.
 *
 * Works with existing useState forms (no React Hook Form required for Phase A).
 * Binary fields (File uploads) are not persisted — only serializable form values.
 *
 * @param {{
 *   draftKey: string | null,
 *   value: object | null,
 *   setValue: (next: object | ((prev: object) => object)) => void,
 *   enabled?: boolean,
 *   debounceMs?: number,
 *   isBaseline?: (value: object) => boolean,
 * }} options
 */
export function useFormDraft({
  draftKey,
  value,
  setValue,
  enabled = true,
  debounceMs = 400,
  isBaseline,
}) {
  const { organization, user } = useAuth();
  const organizationId = organization?.id ?? user?.organization_id ?? "default";
  const hydratedRef = useRef(false);
  const skipNextSaveRef = useRef(false);

  // Reset hydration when the draft key changes (must run before hydrate/persist effects).
  useEffect(() => {
    hydratedRef.current = false;
    skipNextSaveRef.current = false;
  }, [draftKey]);

  // Hydrate once when form is ready.
  useEffect(() => {
    if (!enabled || !draftKey || value == null) return;
    if (hydratedRef.current) return;

    const store = getFormDraftStore(organizationId);
    const draft = store.getState().getDraft(draftKey);
    hydratedRef.current = true;

    if (!draft || typeof draft !== "object") return;

    const baseline = typeof isBaseline === "function" ? isBaseline(value) : true;
    if (!baseline) return;

    skipNextSaveRef.current = true;
    setValue(draft);
  }, [draftKey, enabled, isBaseline, organizationId, setValue, value]);

  // Debounced persist.
  useEffect(() => {
    if (!enabled || !draftKey || value == null) return;
    if (!hydratedRef.current) return;

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    if (typeof isBaseline === "function" && isBaseline(value)) {
      clearFormDraft(organizationId, draftKey);
      return;
    }

    const timer = window.setTimeout(() => {
      getFormDraftStore(organizationId).getState().setDraft(draftKey, value);
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [debounceMs, draftKey, enabled, isBaseline, organizationId, value]);

  return {
    clearDraft() {
      if (!draftKey) return;
      clearFormDraft(organizationId, draftKey);
    },
    organizationId,
  };
}
