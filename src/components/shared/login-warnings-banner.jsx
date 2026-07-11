"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { clearLoginWarnings, getLoginWarnings } from "@/lib/auth-storage";

export function LoginWarningsBanner({ className = "" }) {
  const [warnings, setWarnings] = useState([]);

  useEffect(() => {
    setWarnings(getLoginWarnings());
  }, []);

  if (!warnings.length) return null;

  return (
    <div className={`border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 ${className}`.trim()}>
      <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          {warnings.map((warning, index) => (
            <p key={`${warning.code ?? "warn"}-${index}`}>
              {warning.message}
              {warning.action_url ? (
                <>
                  {" "}
                  <Link
                    href={warning.action_url}
                    className="font-semibold underline underline-offset-2 hover:text-amber-800"
                  >
                    Open Email delivery
                  </Link>
                </>
              ) : null}
            </p>
          ))}
        </div>
        <button
          type="button"
          className="shrink-0 self-start rounded-md px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
          onClick={() => {
            clearLoginWarnings();
            setWarnings([]);
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
