"use client";

import { useState } from "react";
import { normalizePermissionId } from "@/lib/permission-ids";
import { CollapsibleToggle } from "@/components/admin/permission-matrix";

const ACTION_LABELS = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  approve: "Approve",
  deliver: "Deliver",
  manage: "Manage",
};

const ACTION_ORDER = ["view", "create", "edit", "delete", "approve", "deliver", "manage"];

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

function PermissionLegend() {
  return (
    <div className="theme-subtext mb-3 flex flex-wrap gap-3 text-xs">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded border border-[var(--theme-border)] bg-[var(--theme-surface-muted)]" />
        From role
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded border border-emerald-500/40 bg-emerald-500/15" />
        Extra grant
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded border border-red-500/40 bg-red-500/15" />
        Revoked
      </span>
    </div>
  );
}

function UserPermissionModuleTable({
  group,
  rolePermissionIds,
  grantedIds,
  deniedIds,
  onToggle,
  readOnly = false,
}) {
  const [expanded, setExpanded] = useState(true);
  const roleIds =
    rolePermissionIds instanceof Set ? rolePermissionIds : new Set(rolePermissionIds ?? []);
  const granted = grantedIds instanceof Set ? grantedIds : new Set(grantedIds ?? []);
  const denied = deniedIds instanceof Set ? deniedIds : new Set(deniedIds ?? []);

  return (
    <div className="theme-panel rounded-lg border">
      <div className="flex items-start gap-2 border-b border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-3 py-3">
        <CollapsibleToggle
          expanded={expanded}
          onToggle={() => setExpanded((value) => !value)}
          label={group.label}
        />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="theme-heading text-sm font-semibold">{group.label}</p>
          <p className="theme-subtext mt-0.5 text-xs">Module — expand to manage linked features</p>
        </div>
      </div>

      {expanded ? (
        <div className="ml-4 border-l-2 border-[var(--theme-border)] py-1 pl-4 pr-2">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="theme-table-head-row border-b text-left text-xs font-medium uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2">Feature / link</th>
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

                  return (
                    <tr key={feature.key} className="theme-table-body-row">
                      <td className="theme-heading px-3 py-2 pl-5 font-medium">{feature.label}</td>
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
      ) : null}
    </div>
  );
}

function UserApplicationPermissionSection({
  application,
  rolePermissionIds,
  grantedIds,
  deniedIds,
  onToggle,
  readOnly,
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <section className="space-y-2">
      <div
        className={`theme-panel rounded-lg border px-4 py-3 ${
          application.standalone
            ? "border-l-4 border-l-[var(--theme-primary)] bg-[var(--theme-surface-muted)]"
            : "bg-[var(--theme-surface-muted)]"
        }`}
      >
        <div className="flex items-start gap-2">
          <CollapsibleToggle
            expanded={expanded}
            onToggle={() => setExpanded((value) => !value)}
            label={application.label}
          />
          <div className="min-w-0 flex-1">
            <p className="theme-heading text-sm font-semibold">{application.label}</p>
            {application.description ? (
              <p className="theme-subtext mt-0.5 text-xs">{application.description}</p>
            ) : null}
          </div>
        </div>
      </div>

      {expanded ? (
        <div className="ml-3 space-y-4 border-l-2 border-[var(--theme-border)] py-1 pl-4">
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
      ) : null}
    </section>
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
        <PermissionLegend />

        <div className="space-y-6">
          {applications.map((application) => (
            <UserApplicationPermissionSection
              key={application.id}
              application={application}
              rolePermissionIds={rolePermissionIds}
              grantedIds={grantedIds}
              deniedIds={deniedIds}
              onToggle={onToggle}
              readOnly={readOnly}
            />
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
    return <p className="theme-subtext text-sm">No permissions defined.</p>;
  }

  return (
    <div>
      <PermissionLegend />

      <div className="space-y-4">
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
