"use client";

import { normalizePermissionId } from "@/lib/permission-ids";

const ACTION_LABELS = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  approve: "Approve",
  manage: "Manage",
};

const ACTION_ORDER = ["view", "create", "edit", "delete", "approve", "manage"];

export function modulePermissionIds(group) {
  return group.features.flatMap((feature) =>
    feature.permissions.map((p) => normalizePermissionId(p.id)).filter((id) => id != null),
  );
}

export function applicationPermissionIds(application) {
  return (application.modules ?? []).flatMap((group) => modulePermissionIds(group));
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

function applicationSelectionState(application, assignedIds) {
  const ids = applicationPermissionIds(application);
  if (!ids.length) return "none";
  const selected = ids.filter((id) => assignedIds.has(id)).length;
  if (selected === 0) return "none";
  if (selected === ids.length) return "all";
  return "partial";
}

export function PermissionModuleTable({ group, assignedIds, onToggle, onToggleMany }) {
  const selection = moduleSelectionState(group, assignedIds);
  const moduleIds = modulePermissionIds(group);

  return (
    <div className="theme-panel rounded-lg border">
      <div className="flex items-center gap-3 border-b border-[var(--theme-border)] px-4 py-3">
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
          <p className="theme-heading text-sm font-semibold">{group.label}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="theme-table-head-row border-b text-left text-xs font-medium uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2">Feature / link</th>
              {ACTION_ORDER.map((action) => (
                <th key={action} className="px-3 py-2 text-center">
                  {ACTION_LABELS[action] ?? action}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--theme-border)]">
            {group.features.map((feature) => {
              const byAction = Object.fromEntries(feature.permissions.map((p) => [p.action, p]));
              const featureIds = feature.permissions
                .map((p) => normalizePermissionId(p.id))
                .filter((id) => id != null);
              const featureSelected = featureIds.filter((id) => assignedIds.has(id)).length;

              return (
                <tr key={feature.key} className="theme-table-body-row">
                  <td className="px-4 py-2">
                    <label className="theme-heading flex items-center gap-2 font-medium">
                      <input
                        type="checkbox"
                        checked={featureSelected === featureIds.length && featureIds.length > 0}
                        ref={(el) => {
                          if (el) {
                            el.indeterminate =
                              featureSelected > 0 && featureSelected < featureIds.length;
                          }
                        }}
                        onChange={() => onToggleMany(featureIds, featureSelected !== featureIds.length)}
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
                          <span className="theme-subtext opacity-50">—</span>
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

export function PermissionMatrix({ applications, groups, assignedIds, onToggle, onToggleMany }) {
  if (applications?.length) {
    return (
      <div className="space-y-8">
        {applications.map((application) => {
          const selection = applicationSelectionState(application, assignedIds);
          const applicationIds = applicationPermissionIds(application);

          return (
            <section key={application.id} className="space-y-4">
              <div
                className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
                  application.standalone
                    ? "border-violet-200 bg-violet-50/60"
                    : "border-[var(--theme-border)] bg-[var(--theme-panel-muted)]"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  ref={(el) => {
                    if (el) el.indeterminate = selection === "partial";
                  }}
                  checked={selection === "all"}
                  onChange={() => onToggleMany(applicationIds, selection !== "all")}
                  title={`Select all ${application.label} permissions`}
                />
                <div className="min-w-0">
                  <p className="theme-heading text-base font-semibold">{application.label}</p>
                  {application.description ? (
                    <p className="theme-subtext mt-0.5 text-sm">{application.description}</p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-4 pl-1">
                {application.modules.map((group) => (
                  <PermissionModuleTable
                    key={`${application.id}-${group.module}`}
                    group={group}
                    assignedIds={assignedIds}
                    onToggle={onToggle}
                    onToggleMany={onToggleMany}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  if (!groups?.length) {
    return <p className="theme-subtext text-sm">No permissions defined.</p>;
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <PermissionModuleTable
          key={group.module}
          group={group}
          assignedIds={assignedIds}
          onToggle={onToggle}
          onToggleMany={onToggleMany}
        />
      ))}
    </div>
  );
}
