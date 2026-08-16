"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { todayCalendarDate } from "@/lib/datetime";

const STORAGE_PREFIX = "centrix:field-rep-hr-linkage-dismissed";

function linkageFingerprint(reps) {
  return (Array.isArray(reps) ? reps : [])
    .map((rep) => String(rep.user_id))
    .filter(Boolean)
    .sort()
    .join(",");
}

function storageKey(organizationId) {
  return `${STORAGE_PREFIX}:${organizationId || "org"}`;
}

function readDismissed(organizationId) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(organizationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDismissed(organizationId, payload) {
  try {
    window.localStorage.setItem(storageKey(organizationId), JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * @param {{
 *   linkage: {
 *     attention_needed?: boolean;
 *     message?: string | null;
 *     reps?: Array<{
 *       user_id: number;
 *       user_name?: string;
 *       username?: string;
 *       session_count?: number;
 *       employee_id?: number | null;
 *       status?: string;
 *       hint?: string | null;
 *     }>;
 *   } | null;
 *   canManage?: boolean;
 * }} props
 */
export function FieldRepHrLinkageBanner({ linkage, canManage = true }) {
  const { organization } = useAuth();
  const orgId = organization?.id ?? null;
  const reps = useMemo(
    () => (Array.isArray(linkage?.reps) ? linkage.reps : []),
    [linkage?.reps],
  );
  const fingerprint = useMemo(() => linkageFingerprint(reps), [reps]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!linkage?.attention_needed) {
      setDismissed(false);
      return;
    }
    const stored = readDismissed(orgId);
    const today = todayCalendarDate();
    setDismissed(
      Boolean(
        stored &&
          stored.date === today &&
          stored.fingerprint === fingerprint,
      ),
    );
  }, [fingerprint, linkage?.attention_needed, orgId]);

  if (!linkage?.attention_needed || dismissed) return null;

  function dismiss() {
    writeDismissed(orgId, {
      date: todayCalendarDate(),
      fingerprint,
    });
    setDismissed(true);
  }

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">Field attendance not counting in HR / payroll</p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
        >
          Dismiss
        </button>
      </div>
      <p className="mt-1 text-amber-900">{linkage.message}</p>
      <p className="mt-2 text-xs text-amber-900">
        Connect each mobile login to an employee profile: open the employee in HR → Employment →{" "}
        <span className="font-medium">Linked system user</span> and select the rep&apos;s login.
      </p>
      {reps.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {reps.slice(0, 5).map((rep) => (
            <li
              key={rep.user_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200/80 bg-white/70 px-3 py-2"
            >
              <div>
                <p className="font-medium text-slate-900">
                  {rep.user_name || rep.username || `User #${rep.user_id}`}
                  {rep.username && rep.user_name ? (
                    <span className="ml-1 font-normal text-slate-500">({rep.username})</span>
                  ) : null}
                </p>
                <p className="text-xs text-slate-600">
                  {rep.session_count ?? 0} session{(rep.session_count ?? 0) === 1 ? "" : "s"} in range
                  {rep.hint ? ` — ${rep.hint}` : null}
                </p>
              </div>
              {canManage ? (
                rep.employee_id ? (
                  <Link
                    href={`/hr/employees/${rep.employee_id}/edit`}
                    className="shrink-0 text-sm font-medium text-[#185FA5] hover:underline"
                  >
                    Fix employee link
                  </Link>
                ) : (
                  <Link
                    href={`/hr/employees?link_user=${rep.user_id}`}
                    className="shrink-0 text-sm font-medium text-[#185FA5] hover:underline"
                  >
                    Link to employee
                  </Link>
                )
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {reps.length > 5 ? (
        <p className="mt-2 text-xs text-amber-800">+ {reps.length - 5} more rep(s) need linking.</p>
      ) : null}
    </div>
  );
}
