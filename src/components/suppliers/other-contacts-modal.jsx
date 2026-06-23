"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

export function OtherContactsModal({ supplierName, contacts, open, onClose }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;

  const list = Array.isArray(contacts) ? contacts : [];

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-50 bg-black/25"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-labelledby="other-contacts-title"
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 theme-panel rounded-xl border p-4 shadow-xl"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id="other-contacts-title" className="text-sm font-semibold text-slate-900">
              Other contacts
            </h2>
            {supplierName ? (
              <p className="mt-0.5 text-xs text-slate-500">{supplierName}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {list.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No additional contacts recorded.</p>
        ) : (
          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {list.map((c, i) => (
              <li
                key={i}
                className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
              >
                {c.label ? (
                  <p className="font-medium text-slate-800">{c.label}</p>
                ) : null}
                {c.phone ? <p className="text-slate-600">{c.phone}</p> : null}
                {c.email ? (
                  <p className="text-[#185FA5]">{c.email}</p>
                ) : null}
                {!c.label && !c.phone && !c.email ? (
                  <p className="text-slate-500">—</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>,
    document.body,
  );
}
