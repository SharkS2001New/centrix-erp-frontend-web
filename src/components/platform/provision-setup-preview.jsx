"use client";

import { PROVISIONABLE_WORKSPACES, applicationsFromEnabledModules } from "@/lib/workspace-modules";

const APPLICATION_LABELS = Object.fromEntries(
  PROVISIONABLE_WORKSPACES.map((workspace) => [workspace.id, workspace.label]),
);

const CHANNEL_LABELS = {
  pos: "POS terminal",
  mobile: "Mobile field sales",
  backend: "Backoffice web",
};

export function enabledApplicationLabels(enabledModules = {}) {
  const apps = applicationsFromEnabledModules(enabledModules);
  return Object.entries(apps)
    .filter(([, enabled]) => enabled)
    .map(([id]) => APPLICATION_LABELS[id] ?? id);
}

export function channelLabels(channels = []) {
  return channels.map((channel) => CHANNEL_LABELS[channel] ?? channel);
}

export function ProvisionSetupPreview({ preview, loading = false, className = "" }) {
  if (loading) {
    return (
      <aside className={`rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 shadow-sm ${className}`}>
        <p className="theme-subtext text-sm">Loading setup preview…</p>
      </aside>
    );
  }

  if (!preview) {
    return null;
  }

  const apps = enabledApplicationLabels(preview.enabled_modules ?? {});
  const channels = channelLabels(preview.login_channels ?? []);
  const roles = preview.recommended_roles ?? [];
  const steps = preview.onboarding_steps ?? [];

  return (
    <aside
      className={`rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 shadow-sm ${className}`}
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[#185FA5] dark:text-sky-400">
        Setup preview
      </h2>
      <p className="theme-subtext mt-1 text-sm">
        {preview.profile_label ?? preview.deployment_profile} — what this tenant will see after registration.
      </p>

      <div className="mt-4 space-y-4 text-sm">
        <section>
          <h3 className="font-medium text-[var(--theme-text)]">Login workspaces</h3>
          {apps.length ? (
            <ul className="theme-subtext mt-2 list-disc space-y-1 pl-5">
              {apps.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          ) : (
            <p className="theme-subtext mt-2">No applications enabled yet.</p>
          )}
        </section>

        <section>
          <h3 className="font-medium text-[var(--theme-text)]">Sales channels</h3>
          <p className="theme-subtext mt-2">{channels.join(" · ") || "Backoffice web"}</p>
        </section>

        <section>
          <h3 className="font-medium text-[var(--theme-text)]">Recommended staff roles</h3>
          {roles.length ? (
            <ul className="mt-2 space-y-2">
              {roles.map((role) => (
                <li key={role.role_name} className="rounded-lg border border-[var(--theme-border)] px-3 py-2">
                  <p className="font-medium">{role.role_name}</p>
                  {role.description ? <p className="theme-subtext mt-0.5 text-xs">{role.description}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="theme-subtext mt-2">Enable applications to see role suggestions.</p>
          )}
        </section>

        {steps.length ? (
          <section>
            <h3 className="font-medium text-[var(--theme-text)]">After registration</h3>
            <ol className="theme-subtext mt-2 list-decimal space-y-1 pl-5">
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

export function ProvisionTemplateControls({
  templates = [],
  organizations = [],
  templateName,
  onTemplateNameChange,
  onLoadTemplate,
  onSaveTemplate,
  onCloneOrganization,
  selectedCloneOrgId,
  onSelectedCloneOrgIdChange,
  saving = false,
}) {
  return (
    <section className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-subtle)] p-4">
      <h2 className="text-sm font-semibold text-[var(--theme-text)]">Saved setups</h2>
      <p className="theme-subtext mt-1 text-sm">
        Load a saved template, clone an existing organization, or save the current configuration for reuse.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <label className="block text-sm">
          <span className="theme-subtext text-xs font-medium">Load template</span>
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            defaultValue=""
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              const template = templates.find((row) => String(row.id) === id);
              if (template) onLoadTemplate?.(template);
              e.target.value = "";
            }}
          >
            <option value="">Choose a template…</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="theme-subtext text-xs font-medium">Clone organization</span>
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            value={selectedCloneOrgId}
            onChange={(e) => {
              onSelectedCloneOrgIdChange?.(e.target.value);
              if (e.target.value) onCloneOrganization?.(e.target.value);
            }}
          >
            <option value="">Choose an organization…</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.org_name} ({org.company_code})
              </option>
            ))}
          </select>
        </label>

        <div className="block text-sm">
          <span className="theme-subtext text-xs font-medium">Save current setup</span>
          <div className="mt-1 flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={templateName}
              onChange={(e) => onTemplateNameChange?.(e.target.value)}
              placeholder="Template name"
            />
            <button
              type="button"
              disabled={saving || !templateName?.trim()}
              onClick={onSaveTemplate}
              className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
