"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/auth-context";
import { clearFormDraft, getFormDraftStore } from "@/stores/form-drafts";

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
  const lastDraftKeyRef = useRef(draftKey);

  if (lastDraftKeyRef.current !== draftKey) {
    lastDraftKeyRef.current = draftKey;
    hydratedRef.current = false;
    skipNextSaveRef.current = false;
  }

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
