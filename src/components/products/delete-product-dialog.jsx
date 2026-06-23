"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { inputClassName } from "@/components/catalog/catalog-shared";

export function DeleteProductDialog({ open, product, saving, error, onClose, onConfirm }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted || !product) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md theme-panel rounded-xl border p-5 shadow-xl"
      >
        <h2 className="text-[15px] font-medium text-slate-900">Delete product?</h2>
        <p className="mt-3 text-sm text-slate-600">
          Are you sure you want to delete:
        </p>
        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900">
          &quot;{product.product_name}&quot;
        </p>
        <p className="mt-2 font-mono text-xs text-slate-500">{product.product_code}</p>
        <p className="mt-3 text-sm text-slate-500">This action cannot be undone.</p>

        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className={`${inputClassName()} flex-1 border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? "Deleting…" : "Delete product"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
