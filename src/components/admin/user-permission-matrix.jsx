"use client";

const ACTION_LABELS = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  approve: "Approve",
};

function effectiveHas(roleIds, grantedIds, deniedIds, permId) {
  if (deniedIds.has(permId)) return false;
  return roleIds.has(permId) || grantedIds.has(permId);
}

function cellState(roleIds, grantedIds, deniedIds, permId) {
  if (!permId) return "none";
  if (deniedIds.has(permId)) return "denied";
  if (grantedIds.has(permId) && !roleIds.has(permId)) return "granted";
  if (roleIds.has(permId)) return "role";
  return "off";
}

export function UserPermissionMatrix({
  matrix,
  rolePermissionIds,
  grantedIds,
  deniedIds,
  onToggle,
  readOnly = false,
}) {
  const roleIds = rolePermissionIds instanceof Set ? rolePermissionIds : new Set(rolePermissionIds ?? []);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border border-slate-300 bg-slate-100" />
          From role
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border border-emerald-400 bg-emerald-50" />
          Extra grant
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border border-red-300 bg-red-50" />
          Revoked
        </span>
      </div>

      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Module</th>
            {Object.values(ACTION_LABELS).map((label) => (
              <th key={label} className="px-3 py-2 text-center">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {matrix.map((row) => (
            <tr key={row.module}>
              <td className="px-3 py-2 font-medium text-slate-800">{row.label}</td>
              {Object.keys(ACTION_LABELS).map((action) => {
                const perm = row.cells[action];
                const state = cellState(roleIds, grantedIds, deniedIds, perm?.id);
                const checked = perm
                  ? effectiveHas(roleIds, grantedIds, deniedIds, perm.id)
                  : false;

                return (
                  <td key={action} className="px-3 py-2 text-center">
                    {perm ? (
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={readOnly}
                        onChange={() => onToggle?.(perm.id)}
                        title={perm.permission_name}
                        className={
                          state === "denied"
                            ? "accent-red-600"
                            : state === "granted"
                              ? "accent-emerald-600"
                              : undefined
                        }
                      />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {matrix.some((row) => row.extras.length > 0) ? (
        <div className="mt-5 border-t border-slate-200 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Additional permissions
          </p>
          <div className="space-y-2">
            {matrix.flatMap((row) =>
              row.extras.map((perm) => {
                const state = cellState(roleIds, grantedIds, deniedIds, perm.id);
                const checked = effectiveHas(roleIds, grantedIds, deniedIds, perm.id);
                return (
                  <label key={perm.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={readOnly}
                      onChange={() => onToggle?.(perm.id)}
                      className={
                        state === "denied"
                          ? "accent-red-600"
                          : state === "granted"
                            ? "accent-emerald-600"
                            : undefined
                      }
                    />
                    <span>
                      {row.label} — {perm.permission_name}
                    </span>
                  </label>
                );
              }),
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function toggleUserPermissionOverride(permId, roleIds, grantedIds, deniedIds) {
  const nextGranted = new Set(grantedIds);
  const nextDenied = new Set(deniedIds);
  const fromRole = roleIds.has(permId);

  if (fromRole) {
    if (nextDenied.has(permId)) nextDenied.delete(permId);
    else nextDenied.add(permId);
  } else if (nextGranted.has(permId)) {
    nextGranted.delete(permId);
  } else {
    nextGranted.add(permId);
  }

  return { grantedIds: nextGranted, deniedIds: nextDenied };
}
