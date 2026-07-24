"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { KENYA_STATUTORY_DEDUCTIONS } from "@/components/hr/hr-shared";

export function GovernmentDeductionsAside() {
  const [reference, setReference] = useState(null);
  const [example, setExample] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ref, preview] = await Promise.all([
          apiRequest("/payroll/kenya-statutory"),
          apiRequest("/payroll/calculate", { searchParams: { gross_pay: 50000 } }),
        ]);
        if (!cancelled) {
          setReference(ref);
          setExample(preview);
        }
      } catch {
        if (!cancelled) setReference(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refById = new Map((reference?.items ?? []).map((i) => [i.id, i]));

  return (
    <div className="theme-panel rounded-xl border p-4 shadow-sm lg:sticky lg:top-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Government deductions (Kenya)
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Always applied on payroll. Rates are system-configured
      </p>

      <ul className="mt-4 space-y-3">
        {KENYA_STATUTORY_DEDUCTIONS.map((d) => {
          const detail = refById.get(d.id);
          const exampleAmount = example?.[d.id];
          return (
            <li
              key={d.id}
              className="rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2.5 text-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-slate-800">{d.label}</span>
                <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                  System
                </span>
              </div>
              {detail?.formula ? (
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{detail.formula}</p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">{d.hint}</p>
              )}
              {!loading && exampleAmount != null && (
                <p className="mt-1.5 text-xs font-medium text-[#0C447C]">
                  Example @ KES 50,000 gross: KES{" "}
                  {Number(exampleAmount).toLocaleString("en-KE", {
                    maximumFractionDigits: 0,
                  })}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {reference?.net_pay_formula && (
        <p className="mt-4 border-t border-slate-200 pt-3 text-xs leading-relaxed text-slate-500">
          <span className="font-medium text-slate-600">Net pay: </span>
          {reference.net_pay_formula}
        </p>
      )}

      {example && !loading && (
        <div className="mt-3 rounded-lg bg-[#E6F1FB]/50 px-3 py-2 text-xs text-slate-700">
          <p className="font-medium text-slate-800">Sample (KES 50,000 gross)</p>
          <p className="mt-1">
            Net ≈ KES{" "}
            {Number(example.net_pay).toLocaleString("en-KE", { maximumFractionDigits: 0 })}
          </p>
        </div>
      )}

      <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-600">
        <a href="/reports/nssf-remittance" className="font-medium text-slate-800 underline-offset-2 hover:underline">
          NSSF remittance statement
        </a>
        {" — export for remittance (same as bank list)."}
      </p>
    </div>
  );
}
