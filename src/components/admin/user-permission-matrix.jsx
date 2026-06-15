"use client";

const ACTION_LABELS = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  approve: "Approve",
};

const ACTION_ORDER = ["view", "create", "edit", "delete", "approve"];

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

function checkboxClass(state) {
  if (state === "denied") return "accent-red-600";
  if (state === "granted") return "accent-emerald-600";
  return undefined;
}

export function UserPermissionMatrix({
  groups,
  rolePermissionIds,
  grantedIds,
  deniedIds,
  onToggle,
  readOnly = false,
}) {
  const roleIds = rolePermissionIds instanceof Set ? rolePermissionIds : new Set(rolePermissionIds ?? []);
  const granted = grantedIds instanceof Set ? grantedIds : new Set(grantedIds ?? []);
  const denied = deniedIds instanceof Set ? deniedIds : new Set(deniedIds ?? []);

  if (!groups?.length) {
    return <p className="text-sm text-slate-500">No permissions defined.</p>;
  }

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

      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.module} className="rounded-lg border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">{group.label}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Feature / link</th>
                    {ACTION_ORDER.map((action) => (
                      <th key={action} className="px-3 py-2 text-center">
                        {ACTION_LABELS[action]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {group.features.map((feature) => {
                    const byAction = Object.fromEntries(
                      feature.permissions.map((p) => [p.action, p]),
                    );

                    return (
                      <tr key={feature.key}>
                        <td className="px-4 py-2 font-medium text-slate-800">{feature.label}</td>
                        {ACTION_ORDER.map((action) => {
                          const perm = byAction[action];
                          const state = cellState(roleIds, granted, denied, perm?.id);
                          const checked = perm ? effectiveHas(roleIds, granted, denied, perm.id) : false;

                          return (
                            <td key={action} className="px-3 py-2 text-center">
                              {perm ? (
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={readOnly}
                                  onChange={() => onToggle?.(perm.id)}
                                  title={perm.permission_name}
                                  className={checkboxClass(state)}
                                />
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
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
