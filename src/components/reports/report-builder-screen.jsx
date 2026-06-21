"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { WORKSPACE_BUILDER_LABEL } from "@/lib/workspace-reports";
import { CatalogPageShell, Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";

function emptySpec() {
  return {
    source: null,
    sources: [],
    blend_by: null,
    columns: [],
    group_by: [],
    sort: null,
    charts: [],
    kpis: [],
  };
}

function columnRef(sourceKey, fieldKey) {
  return `${sourceKey}:${fieldKey}`;
}

function findSourceSchema(schema, sourceKey) {
  return schema?.sources?.find((s) => s.key === sourceKey);
}

function blendDimensionsForSources(schema, sourceKeys) {
  if (!schema?.blend_dimensions?.length || sourceKeys.length < 2) return [];
  const selected = new Set(sourceKeys);
  return schema.blend_dimensions.filter((dim) =>
    [...selected].every((key) => dim.sources?.includes(key)),
  );
}

function normalizeGroupByEntry(entry, defaultSource) {
  if (typeof entry === "string") {
    return { source: defaultSource, field: entry };
  }
  return { source: entry.source ?? defaultSource, field: entry.field };
}

function groupByMatches(entry, sourceKey, fieldKey, defaultSource) {
  const normalized = normalizeGroupByEntry(entry, defaultSource);
  return normalized.source === sourceKey && normalized.field === fieldKey;
}

function formatPreviewError(error) {
  if (error instanceof ApiError) {
    const errors = error.body?.errors;
    if (errors && typeof errors === "object") {
      for (const key of ["sources", "spec", "blend_by", "columns", "source"]) {
        const message = errors[key]?.[0];
        if (message) return String(message);
      }
      for (const messages of Object.values(errors)) {
        if (Array.isArray(messages) && messages[0]) return String(messages[0]);
      }
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "Preview failed";
}

function emptyPreviewMessage(selectedSources, isBlendMode) {
  if (isBlendMode) {
    return "No rows matched for this side-by-side report. The selected sources may not overlap on the chosen dimension, or current filters excluded all data.";
  }
  if (selectedSources.length > 1) {
    return "No rows were returned. These sources may not share matching records for the current filters, or the combination does not produce joined results. Try different sources, add a group-by field, adjust the date range, or use side-by-side metrics when available.";
  }
  return "No rows matched your selection. Try widening the date range or adjusting branch filters.";
}

function PreviewFeedback({ feedback }) {
  if (!feedback) return null;
  const isError = feedback.kind === "error";

  return (
    <div
      className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
        isError ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <p className="font-medium">{isError ? "Cannot build this report" : "No data returned"}</p>
      <p className="mt-1">{feedback.message}</p>
    </div>
  );
}

export function ReportBuilderScreen() {
  const router = useRouter();
  const workspaceId = getStoredWorkspace() ?? "backoffice";
  const workspaceLabel = WORKSPACE_BUILDER_LABEL[workspaceId] ?? "Workspace data";
  const maxSources = 4;
  const [schema, setSchema] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFeedback, setPreviewFeedback] = useState(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [spec, setSpec] = useState(emptySpec);

  useEffect(() => {
    const params = { workspace_id: workspaceId };
    Promise.all([
      apiRequest("/reports/builder/schema", { searchParams: params }),
      apiRequest("/reports/builder/templates", { searchParams: params }),
    ])
      .then(([schemaRes, templatesRes]) => {
        setSchema(schemaRes);
        setTemplates(templatesRes.data ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load builder"));
  }, [workspaceId]);

  const sourceLimit = schema?.max_sources ?? maxSources;

  const selectedSources = spec.sources ?? [];

  const isMultiSource = selectedSources.length > 1;
  const isBlendMode = isMultiSource && Boolean(spec.blend_by);

  const sourcesByModule = useMemo(() => {
    const grouped = new Map();
    for (const source of schema?.sources ?? []) {
      const sourceModule = source.module ?? "General";
      if (!grouped.has(sourceModule)) grouped.set(sourceModule, []);
      grouped.get(sourceModule).push(source);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [schema]);

  const availableBlendDimensions = useMemo(
    () => blendDimensionsForSources(schema, selectedSources),
    [schema, selectedSources],
  );

  useEffect(() => {
    if (!isMultiSource && spec.blend_by) {
      setSpec((prev) => ({ ...prev, blend_by: null }));
    }
  }, [isMultiSource, spec.blend_by]);

  useEffect(() => {
    if (!spec.blend_by) return;
    if (!availableBlendDimensions.some((d) => d.key === spec.blend_by)) {
      setSpec((prev) => ({ ...prev, blend_by: null }));
    }
  }, [availableBlendDimensions, spec.blend_by]);

  function toggleSource(sourceKey) {
    setSpec((prev) => {
      const current = [...(prev.sources ?? [])];
      const exists = current.includes(sourceKey);
      let nextSources;
      if (exists) {
        nextSources = current.filter((k) => k !== sourceKey);
      } else {
        if (current.length >= sourceLimit) return prev;
        nextSources = [...current, sourceKey];
      }

      const nextColumns = prev.columns.filter((col) => nextSources.includes(col.source));
      const nextGroupBy = prev.group_by.filter((entry) => {
        const normalized = normalizeGroupByEntry(entry, prev.source);
        return nextSources.includes(normalized.source);
      });

      return {
        ...prev,
        source: nextSources[0] ?? null,
        sources: nextSources,
        columns: nextColumns,
        group_by: nextGroupBy,
        blend_by: nextSources.length > 1 ? prev.blend_by : null,
      };
    });
    setPreviewRows([]);
    setPreviewFeedback(null);
  }

  function toggleColumn(sourceKey, fieldKey) {
    setSpec((prev) => {
      const sourceSchema = findSourceSchema(schema, sourceKey);
      const field = sourceSchema?.fields?.find((f) => f.key === fieldKey);
      if (!field) return prev;

      const exists = prev.columns.find((c) => c.source === sourceKey && c.field === fieldKey);

      if (exists) {
        return {
          ...prev,
          columns: prev.columns.filter((c) => !(c.source === sourceKey && c.field === fieldKey)),
          group_by: prev.group_by.filter((g) => !groupByMatches(g, sourceKey, fieldKey, prev.source)),
        };
      }

      const multi = (prev.sources?.length ?? 0) > 1;
      const blend = multi && prev.blend_by;
      const normalizedGroupBy = prev.group_by.map((g) => normalizeGroupByEntry(g, prev.source));
      const aggregate =
        blend && field.aggregates?.length
          ? field.aggregates[0]
          : normalizedGroupBy.length && !field.groupable
            ? field.aggregates?.[0] ?? "sum"
            : undefined;

      return {
        ...prev,
        columns: [
          ...prev.columns,
          {
            source: sourceKey,
            field: fieldKey,
            label: field.label,
            ...(aggregate ? { aggregate } : {}),
          },
        ],
      };
    });
    setPreviewFeedback(null);
  }

  function toggleGroupBy(sourceKey, fieldKey) {
    if (isBlendMode) return;

    setSpec((prev) => {
      const inGroup = prev.group_by.some((g) => groupByMatches(g, sourceKey, fieldKey, prev.source));
      const multi = (prev.sources?.length ?? 1) > 1;

      let group_by;
      if (inGroup) {
        group_by = prev.group_by.filter((g) => !groupByMatches(g, sourceKey, fieldKey, prev.source));
      } else if (multi) {
        group_by = [...prev.group_by, { source: sourceKey, field: fieldKey }];
      } else {
        group_by = [...prev.group_by, fieldKey];
      }

      let columns = [...prev.columns];
      const sourceSchema = findSourceSchema(schema, sourceKey);
      const field = sourceSchema?.fields?.find((f) => f.key === fieldKey);

      if (!inGroup && field && !columns.find((c) => c.field === fieldKey && c.source === sourceKey)) {
        columns.push({ source: sourceKey, field: fieldKey, label: field.label });
      }

      if (group_by.length) {
        columns = columns.map((col) => {
          const colSource = col.source;
          const fieldMeta = findSourceSchema(schema, colSource)?.fields?.find((f) => f.key === col.field);
          const grouped = group_by.some((g) => groupByMatches(g, colSource, col.field, prev.source));

          if (grouped) {
            const { aggregate, ...rest } = col;
            return rest;
          }
          if (!fieldMeta?.aggregates?.length) return col;
          return { ...col, aggregate: col.aggregate ?? fieldMeta.aggregates[0] };
        });
      }

      return { ...prev, group_by, columns };
    });
    setPreviewFeedback(null);
  }

  async function runPreview() {
    if (!selectedSources.length) {
      setError("Select at least one data source.");
      return;
    }
    if (!spec.columns.length) {
      setError("Select at least one column.");
      return;
    }
    setPreviewLoading(true);
    setError(null);
    setPreviewFeedback(null);
    try {
      const res = await apiRequest("/reports/builder/preview", {
        method: "POST",
        body: { spec, per_page: 25, workspace_id: workspaceId },
      });
      const rows = res.data ?? [];
      setPreviewRows(rows);
      if (rows.length === 0) {
        setPreviewFeedback({
          kind: "empty",
          message: emptyPreviewMessage(selectedSources, isBlendMode),
        });
      }
    } catch (e) {
      setPreviewRows([]);
      setPreviewFeedback({
        kind: "error",
        message: formatPreviewError(e),
      });
    } finally {
      setPreviewLoading(false);
    }
  }

  async function saveTemplate() {
    if (!name.trim()) {
      setError("Enter a report name.");
      return;
    }
    if (!selectedSources.length) {
      setError("Select at least one data source.");
      return;
    }
    if (!spec.columns.length) {
      setError("Select at least one column.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await apiRequest("/reports/builder/templates", {
        method: "POST",
        body: {
          name: name.trim(),
          description: description.trim() || null,
          spec,
          is_shared: isShared,
          workspace_id: workspaceId,
        },
      });
      router.push(`/reports/custom/${created.id}`);
    } catch (e) {
      setError(formatPreviewError(e));
    } finally {
      setSaving(false);
    }
  }

  const previewKeys = previewRows[0]
    ? Object.keys(previewRows[0])
    : spec.columns.map((c) => c.alias ?? c.field);

  const blendLabel = availableBlendDimensions.find((d) => d.key === spec.blend_by)?.label;
  const normalizedGroupBy = spec.group_by.map((g) => normalizeGroupByEntry(g, spec.source));

  return (
    <CatalogPageShell
      title="Report builder"
      subtitle={`Compose custom reports from ${workspaceLabel.toLowerCase()} fields. Select multiple sources to combine columns.`}
    >
      <AdminBreadcrumb items={[{ label: "Reports", href: "/reports" }, { label: "Report builder" }]} />

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-1">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">1. Data sources</h2>
            <p className="mt-1 text-xs text-slate-500">
              Choose one or more sources (up to {sourceLimit}). Related sources are joined automatically when you
              preview.
            </p>
            <ul className="mt-3 max-h-56 space-y-3 overflow-y-auto text-sm">
              {sourcesByModule.map(([module, sources]) => (
                <li key={module}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{module}</p>
                  <ul className="space-y-1.5">
                    {sources.map((s) => {
                      const checked = selectedSources.includes(s.key);
                      const atLimit = !checked && selectedSources.length >= sourceLimit;
                      return (
                        <li key={s.key} className="flex items-start gap-2">
                          <input
                            id={`src-${s.key}`}
                            type="checkbox"
                            checked={checked}
                            disabled={atLimit}
                            onChange={() => toggleSource(s.key)}
                            className="mt-1"
                          />
                          <label htmlFor={`src-${s.key}`} className="min-w-0 flex-1 cursor-pointer">
                            <span className="font-medium text-slate-800">{s.label}</span>
                            {s.description ? (
                              <span className="mt-0.5 block text-xs text-slate-400">{s.description}</span>
                            ) : null}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </section>

          {isMultiSource && availableBlendDimensions.length ? (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">2. Side-by-side metrics (optional)</h2>
              <p className="mt-1 text-xs text-slate-500">
                By default, sources are joined into one table. Use this only when you want aggregated metrics aligned
                by a shared dimension (e.g. month or branch).
              </p>
              <Field label="Combine mode">
                <select
                  className={inputClassName()}
                  value={spec.blend_by ?? ""}
                  onChange={(e) => {
                    const blendBy = e.target.value || null;
                    setSpec((prev) => ({
                      ...prev,
                      blend_by: blendBy,
                      group_by: blendBy ? [] : prev.group_by,
                    }));
                    setPreviewRows([]);
                    setPreviewFeedback(null);
                  }}
                >
                  <option value="">Join sources (default)</option>
                  {availableBlendDimensions.map((dim) => (
                    <option key={dim.key} value={dim.key}>
                      Side-by-side by {dim.label.toLowerCase()}
                    </option>
                  ))}
                </select>
              </Field>
              {isBlendMode ? (
                <p className="mt-2 text-xs text-slate-500">
                  Metrics from each source are aggregated per {blendLabel?.toLowerCase() ?? "shared row"} and shown
                  side by side.
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">
              {isMultiSource && availableBlendDimensions.length ? "3. Columns" : isMultiSource ? "2. Columns" : "2. Columns"}
            </h2>
            <div className="mt-3 max-h-72 space-y-4 overflow-y-auto text-sm">
              {selectedSources.length === 0 ? (
                <p className="text-slate-500">Select a data source above to see its columns.</p>
              ) : (
                selectedSources.map((sourceKey) => {
                  const sourceSchema = findSourceSchema(schema, sourceKey);
                  if (!sourceSchema) return null;
                  return (
                    <div key={sourceKey}>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                        {sourceSchema.label}
                      </p>
                      <ul className="space-y-2">
                        {sourceSchema.fields.map((field) => {
                          const selected = spec.columns.some(
                            (c) => c.source === sourceKey && c.field === field.key,
                          );
                          const disabled = isBlendMode && !field.aggregates?.length;
                          return (
                            <li key={columnRef(sourceKey, field.key)} className="flex items-start gap-2">
                              <input
                                id={`col-${sourceKey}-${field.key}`}
                                type="checkbox"
                                checked={selected}
                                disabled={disabled}
                                onChange={() => toggleColumn(sourceKey, field.key)}
                                className="mt-1"
                              />
                              <label
                                htmlFor={`col-${sourceKey}-${field.key}`}
                                className={`min-w-0 flex-1 ${disabled ? "cursor-not-allowed text-slate-400" : "cursor-pointer"}`}
                              >
                                <span className="font-medium text-slate-800">{field.label}</span>
                                <span className="ml-1 text-xs text-slate-400">({field.type})</span>
                                {disabled ? (
                                  <span className="ml-1 text-xs text-slate-400">— metrics only in side-by-side mode</span>
                                ) : null}
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {!isBlendMode && selectedSources.length > 0 ? (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">
                {isMultiSource && availableBlendDimensions.length ? "4. Group by (optional)" : isMultiSource ? "3. Group by (optional)" : "3. Group by (optional)"}
              </h2>
              <ul className="mt-3 space-y-2 text-sm">
                {selectedSources.flatMap((sourceKey) => {
                  const sourceSchema = findSourceSchema(schema, sourceKey);
                  return (sourceSchema?.fields ?? [])
                    .filter((f) => f.groupable)
                    .map((field) => (
                      <li key={columnRef(sourceKey, field.key)} className="flex items-center gap-2">
                        <input
                          id={`grp-${sourceKey}-${field.key}`}
                          type="checkbox"
                          checked={spec.group_by.some((g) => groupByMatches(g, sourceKey, field.key, spec.source))}
                          onChange={() => toggleGroupBy(sourceKey, field.key)}
                        />
                        <label htmlFor={`grp-${sourceKey}-${field.key}`} className="cursor-pointer text-slate-700">
                          {sourceSchema?.label}: {field.label}
                        </label>
                      </li>
                    ));
                })}
              </ul>
            </section>
          ) : null}

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Save template</h2>
            <div className="mt-3 space-y-3">
              <Field label="Report name">
                <input className={inputClassName()} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Description">
                <textarea
                  className={inputClassName()}
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={isShared} onChange={(e) => setIsShared(e.target.checked)} />
                Share with organization
              </label>
              <div className="flex flex-wrap gap-2">
                <PrimaryButton
                  type="button"
                  onClick={runPreview}
                  disabled={previewLoading || !selectedSources.length || !spec.columns.length}
                >
                  {previewLoading ? "Previewing…" : "Preview"}
                </PrimaryButton>
                <PrimaryButton
                  type="button"
                  onClick={saveTemplate}
                  disabled={saving || !selectedSources.length || !spec.columns.length}
                >
                  {saving ? "Saving…" : "Save report"}
                </PrimaryButton>
              </div>
            </div>
          </section>

          {templates.length ? (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Saved reports</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {templates.map((t) => (
                  <li key={t.id}>
                    <Link href={`/reports/custom/${t.id}`} className="text-indigo-600 hover:underline">
                      {t.name}
                    </Link>
                    {t.is_shared ? <span className="ml-2 text-xs text-slate-400">shared</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="xl:col-span-2">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Preview</h2>
            <p className="mt-1 text-xs text-slate-500">
              {selectedSources.length} source(s) · {spec.columns.length} column(s)
              {isBlendMode && blendLabel ? ` · side-by-side by ${blendLabel.toLowerCase()}` : ""}
              {!isBlendMode && normalizedGroupBy.length
                ? ` · grouped by ${normalizedGroupBy.length} field(s)`
                : ""}
            </p>
            {previewLoading ? (
              <p className="mt-4 text-sm text-slate-500">Loading preview…</p>
            ) : previewRows.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                      {previewKeys.map((k) => (
                        <th key={k} className="px-3 py-2">
                          {k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.slice(0, 15).map((row, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        {previewKeys.map((k) => (
                          <td key={k} className="px-3 py-2 text-slate-700">
                            {row[k] == null ? "—" : String(row[k])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : previewFeedback ? (
              <PreviewFeedback feedback={previewFeedback} />
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                {selectedSources.length === 0
                  ? "Select a data source, then choose columns and click Preview."
                  : "Select columns and click Preview."}
              </p>
            )}
          </section>
        </div>
      </div>
    </CatalogPageShell>
  );
}
