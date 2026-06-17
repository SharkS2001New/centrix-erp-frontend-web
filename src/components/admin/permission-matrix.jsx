"use client";

import { normalizePermissionId } from "@/lib/permission-ids";

const ACTION_LABELS = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  approve: "Approve",
};

const ACTION_ORDER = ["view", "create", "edit", "delete", "approve"];

function modulePermissionIds(group) {
  return group.features.flatMap((feature) =>
    feature.permissions.map((p) => normalizePermissionId(p.id)).filter((id) => id != null),
  );
}

function isAssigned(assignedIds, permId) {
  const id = normalizePermissionId(permId);
  return id != null && assignedIds.has(id);
}

function moduleSelectionState(group, assignedIds) {
  const ids = modulePermissionIds(group);
  if (!ids.length) return "none";
  const selected = ids.filter((id) => assignedIds.has(id)).length;
  if (selected === 0) return "none";
  if (selected === ids.length) return "all";
  return "partial";
}

export function PermissionMatrix({ groups, assignedIds, onToggle, onToggleMany }) {
  if (!groups?.length) {
    return <p className="text-sm text-slate-500">No permissions defined.</p>;
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const selection = moduleSelectionState(group, assignedIds);
        const moduleIds = modulePermissionIds(group);

        return (
          <div key={group.module} className="rounded-lg border border-slate-200">
            <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <input
                type="checkbox"
                ref={(el) => {
                  if (el) el.indeterminate = selection === "partial";
                }}
                checked={selection === "all"}
                onChange={() => onToggleMany(moduleIds, selection !== "all")}
                title={`Select all ${group.label} permissions`}
              />
              <div>
                <p className="text-sm font-semibold text-slate-900">{group.label}</p>
              </div>
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
                    const featureIds = feature.permissions
                      .map((p) => normalizePermissionId(p.id))
                      .filter((id) => id != null);
                    const featureSelected = featureIds.filter((id) => assignedIds.has(id)).length;

                    return (
                      <tr key={feature.key}>
                        <td className="px-4 py-2">
                          <label className="flex items-center gap-2 font-medium text-slate-800">
                            <input
                              type="checkbox"
                              checked={featureSelected === featureIds.length && featureIds.length > 0}
                              ref={(el) => {
                                if (el) {
                                  el.indeterminate =
                                    featureSelected > 0 && featureSelected < featureIds.length;
                                }
                              }}
                              onChange={() =>
                                onToggleMany(featureIds, featureSelected !== featureIds.length)
                              }
                              title={`Select all ${feature.label} permissions`}
                            />
                            <span>{feature.label}</span>
                          </label>
                        </td>
                        {ACTION_ORDER.map((action) => {
                          const perm = byAction[action];
                          return (
                            <td key={action} className="px-3 py-2 text-center">
                              {perm ? (
                                <input
                                  type="checkbox"
                                  checked={isAssigned(assignedIds, perm.id)}
                                  onChange={() => onToggle(normalizePermissionId(perm.id))}
                                  title={perm.permission_name}
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
      })}
    </div>
  );
}
