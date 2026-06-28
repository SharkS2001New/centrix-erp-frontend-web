"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

const ConfirmContext = createContext(null);

/** App-wide confirm dialog — mounted once in Providers. */
export function ConfirmProvider({ children }) {
  const [options, setOptions] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setOptions({
        title: opts.title ?? "Confirm",
        message: opts.message ?? "Are you sure?",
        confirmLabel: opts.confirmLabel ?? "Confirm",
        cancelLabel: opts.cancelLabel ?? "Cancel",
        destructive: opts.destructive ?? false,
      });
    });
  }, []);

  const finish = useCallback((result) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setOptions(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options ? (
        <ConfirmDialog
          open
          title={options.title}
          message={options.message}
          confirmLabel={options.confirmLabel}
          cancelLabel={options.cancelLabel}
          destructive={options.destructive}
          onConfirm={() => finish(true)}
          onCancel={() => finish(false)}
        />
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return confirm;
}
