"use client";

import { useState } from "react";
import { normalizePermissionId } from "@/lib/permission-ids";

const ACTION_LABELS = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  approve: "Approve",
  give: "Give",
  deliver: "Deliver",
  manage: "Manage",
};

const ACTION_ORDER = ["view", "create", "edit", "delete", "approve", "give", "deliver", "manage"];

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

function ChevronIcon({ expanded, className = "" }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
      className={`h-4 w-4 shrink-0 transition-transform duration-200 ${expanded ? "rotate-90" : ""} ${className}`}
    >
      <path
        fillRule="evenodd"
        d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function CollapsibleToggle({ expanded, onToggle, label }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
      className="mt-0.5 shrink-0 rounded p-0.5 text-[var(--theme-text-subtle)] hover:bg-[var(--theme-hover)]"
    >
      <ChevronIcon expanded={expanded} />
    </button>
  );
}

function ModuleCheckbox({ selection, moduleIds, groupLabel, onToggleMany }) {
  return (
    <input
      type="checkbox"
      ref={(el) => {
        if (el) el.indeterminate = selection === "partial";
      }}
      checked={selection === "all"}
      onChange={() => onToggleMany(moduleIds, selection !== "all")}
      onClick={(e) => e.stopPropagation()}
      title={`Select all ${groupLabel} permissions`}
    />
  );
}

export function PermissionModuleTable({ group, assignedIds, onToggle, onToggleMany }) {
  const [expanded, setExpanded] = useState(true);
  const selection = moduleSelectionState(group, assignedIds);
  const moduleIds = modulePermissionIds(group);

  return (
    <div className="theme-panel rounded-lg border">
      <div className="flex items-start gap-2 border-b border-[var(--theme-border)] px-3 py-3">
        <CollapsibleToggle
          expanded={expanded}
          onToggle={() => setExpanded((value) => !value)}
          label={group.label}
        />
        <ModuleCheckbox
          selection={selection}
          moduleIds={moduleIds}
          groupLabel={group.label}
          onToggleMany={onToggleMany}
        />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="theme-heading text-sm font-semibold">{group.label}</p>
          <p className="theme-subtext mt-0.5 text-xs">Module — expand to manage linked features</p>
        </div>
      </div>

      {expanded ? (
        <div className="ml-4 border-l-2 border-[var(--theme-border)]/70 py-1 pl-4 pr-2">
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
                  const featureIds = feature.permissions
                    .map((p) => normalizePermissionId(p.id))
                    .filter((id) => id != null);
                  const featureSelected = featureIds.filter((id) => assignedIds.has(id)).length;

                  return (
                    <tr key={feature.key} className="theme-table-body-row">
                      <td className="px-3 py-2">
                        <label className="theme-heading flex items-center gap-2 pl-2 font-medium">
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
      ) : null}
    </div>
  );
}

function ApplicationPermissionSection({
  application,
  assignedIds,
  onToggle,
  onToggleMany,
}) {
  const [expanded, setExpanded] = useState(true);
  const selection = applicationSelectionState(application, assignedIds);
  const applicationIds = applicationPermissionIds(application);

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
          <input
            type="checkbox"
            className="mt-1"
            ref={(el) => {
              if (el) el.indeterminate = selection === "partial";
            }}
            checked={selection === "all"}
            onChange={() => onToggleMany(applicationIds, selection !== "all")}
            onClick={(e) => e.stopPropagation()}
            title={`Select all ${application.label} permissions`}
          />
          <div className="min-w-0 flex-1">
            <p className="theme-heading text-base font-semibold">{application.label}</p>
            {application.description ? (
              <p className="theme-subtext mt-0.5 text-sm">{application.description}</p>
            ) : null}
          </div>
        </div>
      </div>

      {expanded ? (
        <div className="ml-3 space-y-4 border-l-2 border-[var(--theme-border)]/70 py-1 pl-4">
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
      ) : null}
    </section>
  );
}

export function PermissionMatrix({ applications, groups, assignedIds, onToggle, onToggleMany }) {
  if (applications?.length) {
    return (
      <div className="space-y-6">
        {applications.map((application) => (
          <ApplicationPermissionSection
            key={application.id}
            application={application}
            assignedIds={assignedIds}
            onToggle={onToggle}
            onToggleMany={onToggleMany}
          />
        ))}
      </div>
    );
  }

  if (!groups?.length) {
    return <p className="theme-subtext text-sm">No permissions defined.</p>;
  }

  return (
    <div className="space-y-4">
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
