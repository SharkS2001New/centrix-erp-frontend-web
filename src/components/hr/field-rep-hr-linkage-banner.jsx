"use client";

import Link from "next/link";

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
  if (!linkage?.attention_needed) return null;

  const reps = Array.isArray(linkage.reps) ? linkage.reps : [];

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-medium">Field attendance not counting in HR / payroll</p>
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
