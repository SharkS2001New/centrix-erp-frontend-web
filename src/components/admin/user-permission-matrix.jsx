"use client";

import { normalizePermissionId } from "@/lib/permission-ids";
import { PermissionModuleTable } from "@/components/admin/permission-matrix";

const ACTION_LABELS = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  approve: "Approve",
  manage: "Manage",
};

const ACTION_ORDER = ["view", "create", "edit", "delete", "approve", "manage"];

function effectiveHas(roleIds, grantedIds, deniedIds, permId) {
  const id = normalizePermissionId(permId);
  if (id == null) return false;
  if (deniedIds.has(id)) return false;
  return roleIds.has(id) || grantedIds.has(id);
}

function cellState(roleIds, grantedIds, deniedIds, permId) {
  const id = normalizePermissionId(permId);
  if (id == null) return "none";
  if (deniedIds.has(id)) return "denied";
  if (grantedIds.has(id) && !roleIds.has(id)) return "granted";
  if (roleIds.has(id)) return "role";
  return "off";
}

function checkboxClass(state) {
  if (state === "denied") return "accent-red-600";
  if (state === "granted") return "accent-emerald-600";
  return undefined;
}

function UserPermissionModuleTable({
  group,
  rolePermissionIds,
  grantedIds,
  deniedIds,
  onToggle,
  readOnly = false,
}) {
  const roleIds =
    rolePermissionIds instanceof Set ? rolePermissionIds : new Set(rolePermissionIds ?? []);
  const granted = grantedIds instanceof Set ? grantedIds : new Set(grantedIds ?? []);
  const denied = deniedIds instanceof Set ? deniedIds : new Set(deniedIds ?? []);

  return (
    <div className="rounded-lg border border-slate-200">
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
                  {ACTION_LABELS[action] ?? action}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {group.features.map((feature) => {
              const byAction = Object.fromEntries(feature.permissions.map((p) => [p.action, p]));

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
                            onChange={() => onToggle?.(normalizePermissionId(perm.id))}
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
  );
}

export function UserPermissionMatrix({
  applications,
  groups,
  rolePermissionIds,
  grantedIds,
  deniedIds,
  onToggle,
  readOnly = false,
}) {
  if (applications?.length) {
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

        <div className="space-y-8">
          {applications.map((application) => (
            <section key={application.id} className="space-y-4">
              <div
                className={`rounded-lg border px-4 py-3 ${
                  application.standalone
                    ? "border-violet-200 bg-violet-50"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">{application.label}</p>
                {application.description ? (
                  <p className="mt-0.5 text-xs text-slate-600">{application.description}</p>
                ) : null}
              </div>

              <div className="space-y-4">
                {application.modules.map((group) => (
                  <UserPermissionModuleTable
                    key={`${application.id}-${group.module}`}
                    group={group}
                    rolePermissionIds={rolePermissionIds}
                    grantedIds={grantedIds}
                    deniedIds={deniedIds}
                    onToggle={onToggle}
                    readOnly={readOnly}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    );
  }

  const roleIds =
    rolePermissionIds instanceof Set ? rolePermissionIds : new Set(rolePermissionIds ?? []);
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
          <UserPermissionModuleTable
            key={group.module}
            group={group}
            rolePermissionIds={roleIds}
            grantedIds={granted}
            deniedIds={denied}
            onToggle={onToggle}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  );
}

export function toggleUserPermissionOverride(permId, roleIds, grantedIds, deniedIds) {
  const id = normalizePermissionId(permId);
  if (id == null) {
    return { grantedIds, deniedIds };
  }

  const nextGranted = new Set(grantedIds);
  const nextDenied = new Set(deniedIds);
  const fromRole = roleIds.has(id);

  if (fromRole) {
    if (nextDenied.has(id)) nextDenied.delete(id);
    else nextDenied.add(id);
  } else if (nextGranted.has(id)) {
    nextGranted.delete(id);
  } else {
    nextGranted.add(id);
  }

  return { grantedIds: nextGranted, deniedIds: nextDenied };
}
