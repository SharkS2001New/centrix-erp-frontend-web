import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Org-scoped form drafts for Phase A tab/route persistence.
 * Survives remounts and full page refresh (localStorage).
 */

function storageKey(organizationId) {
  return `centrix-form-drafts:${organizationId ?? "default"}`;
}

function createDraftsStore(organizationId) {
  return create(
    persist(
      (set, get) => ({
        drafts: {},
        setDraft(draftKey, value) {
          if (!draftKey) return;
          set((state) => ({
            drafts: {
              ...state.drafts,
              [draftKey]: {
                value,
                updatedAt: Date.now(),
              },
            },
          }));
        },
        getDraft(draftKey) {
          return get().drafts[draftKey]?.value ?? null;
        },
        clearDraft(draftKey) {
          if (!draftKey) return;
          set((state) => {
            if (!(draftKey in state.drafts)) return state;
            const next = { ...state.drafts };
            delete next[draftKey];
            return { drafts: next };
          });
        },
        clearAllDrafts() {
          set({ drafts: {} });
        },
      }),
      {
        name: storageKey(organizationId),
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({ drafts: state.drafts }),
      },
    ),
  );
}

/** @type {Map<string, ReturnType<typeof createDraftsStore>>} */
const storesByOrg = new Map();

export function getFormDraftStore(organizationId) {
  const key = String(organizationId ?? "default");
  if (!storesByOrg.has(key)) {
    storesByOrg.set(key, createDraftsStore(key));
  }
  return storesByOrg.get(key);
}

export function formDraftKey(module, entityId = "new") {
  return `${module}:${entityId ?? "new"}`;
}

export function clearFormDraft(organizationId, draftKey) {
  getFormDraftStore(organizationId).getState().clearDraft(draftKey);
}
