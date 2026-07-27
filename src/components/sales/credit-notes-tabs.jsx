"use client";

import Link from "next/link";

const TABS = [
  { id: "customer", label: "Customer credit notes", href: "/sales/credit-notes" },
  { id: "supplier", label: "Supplier credit notes", href: "/sales/credit-notes/supplier" },
];

export function CreditNotesTabs({ active }) {
  return (
    <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200">
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "border-[#185FA5] text-[#185FA5]"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
