"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useBackgroundTasks } from "@/contexts/background-task-context";
import { queueReportBuilderPreview } from "@/lib/report-export-api";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { WORKSPACE_BUILDER_LABEL } from "@/lib/workspace-reports";
import { CatalogPageShell, Field, PrimaryButton, inputClassName, SearchableSelect } from "@/components/catalog/catalog-shared";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { ReportExportToolbar } from "@/components/reports/report-export-toolbar";
import { ReportBuilderAiSuggest } from "@/components/reports/report-builder-ai-suggest";
import { applyReportBuilderSuggestion } from "@/lib/reports/report-builder-ai-suggest";
import { filterReportColumnKeys, reportColumnLabel } from "@/lib/reports/report-column-visibility";
import {
  REPORT_BUILDER_MASTER_FIELDS,
  moveReportBuilderColumn,
  orderedReportBuilderPreviewKeys,
  reportBuilderColumnCatalog,
  reportBuilderVisibleFields,
} from "@/lib/reports/report-builder-columns";

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

/** Drop columns that duplicate a master-source field once that master is selected. */
function pruneMasterDuplicateColumns(columns, selectedSources) {
  const selected = new Set(selectedSources);
  return columns.filter((col) => {
    const master = REPORT_BUILDER_MASTER_FIELDS[col.field];
    if (!master) return true;
    if (!selected.has(master)) return true;
    return col.source === master;
  });
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

function emptyPreviewMessage(selectedSources) {
  if (selectedSources.length > 1) {
    return "No rows matched. Try a wider date range, fewer filters, or pick a different combination of sources.";
  }
  return "No rows matched. Try widening the date range or adjusting branch filters.";
}

function PreviewFeedback({ feedback }) {
  if (!feedback) return null;
  const isError = feedback.kind === "error";

  return (
    <div
      className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
        isError ? "border-red-200 bg-red-50 text-red-800" : "border-slate-200 bg-slate-50 text-slate-700"
      }`}
    >
      <p className="font-medium">{isError ? "Could not build this report" : "No rows for this preview"}</p>
      <p className="mt-1">{feedback.message}</p>
    </div>
  );
}

export function ReportBuilderScreen() {
  const router = useRouter();
  const { runBackgroundTask } = useBackgroundTasks();
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
  const [sourceQuery, setSourceQuery] = useState("");
  const [columnQuery, setColumnQuery] = useState("");

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
  const selectedSources = useMemo(() => spec.sources ?? [], [spec.sources]);
  const isMultiSource = selectedSources.length > 1;
  const isBlendMode = isMultiSource && Boolean(spec.blend_by);

  const sourcesByModule = useMemo(() => {
    const q = sourceQuery.trim().toLowerCase();
    const grouped = new Map();
    for (const source of schema?.sources ?? []) {
      if (
        q &&
        !`${source.label} ${source.description ?? ""} ${source.module ?? ""}`.toLowerCase().includes(q)
      ) {
        continue;
      }
      const sourceModule = source.module ?? "General";
      if (!grouped.has(sourceModule)) grouped.set(sourceModule, []);
      grouped.get(sourceModule).push(source);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [schema, sourceQuery]);

  const availableBlendDimensions = useMemo(
    () => blendDimensionsForSources(schema, selectedSources),
    [schema, selectedSources],
  );

  const columnCatalog = useMemo(() => {
    const rows = reportBuilderColumnCatalog(schema, selectedSources);
    const q = columnQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => row.searchText.includes(q));
  }, [schema, selectedSources, columnQuery]);

  const dimensionColumns = useMemo(
    () => columnCatalog.filter((row) => row.field.groupable && !row.field.aggregates?.length),
    [columnCatalog],
  );
  const metricColumns = useMemo(
    () => columnCatalog.filter((row) => row.field.aggregates?.length),
    [columnCatalog],
  );
  const otherColumns = useMemo(
    () =>
      columnCatalog.filter(
        (row) => !(row.field.groupable && !row.field.aggregates?.length) && !row.field.aggregates?.length,
      ),
    [columnCatalog],
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

      let nextColumns = prev.columns.filter((col) => nextSources.includes(col.source));
      nextColumns = pruneMasterDuplicateColumns(nextColumns, nextSources);
      const nextGroupBy = prev.group_by.filter((entry) => {
        const normalized = normalizeGroupByEntry(entry, prev.source);
        if (!nextSources.includes(normalized.source)) return false;
        const master = REPORT_BUILDER_MASTER_FIELDS[normalized.field];
        if (master && nextSources.includes(master) && normalized.source !== master) return false;
        return true;
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
      const grouping = normalizedGroupBy.length > 0;

      let group_by = prev.group_by;
      if (grouping && field.groupable && !field.aggregates?.length) {
        const alreadyGrouped = group_by.some((g) => groupByMatches(g, sourceKey, fieldKey, prev.source));
        if (!alreadyGrouped) {
          group_by = multi
            ? [...group_by, { source: sourceKey, field: fieldKey }]
            : [...group_by, fieldKey];
        }
      }

      const aggregate =
        blend && field.aggregates?.length
          ? field.aggregates[0]
          : grouping && !field.groupable
            ? field.aggregates?.[0] ?? "max"
            : grouping && field.aggregates?.length
              ? field.aggregates[0]
              : undefined;

      let columns = [
        ...prev.columns,
        {
          source: sourceKey,
          field: fieldKey,
          label: field.label,
          ...(aggregate ? { aggregate } : {}),
        },
      ];
      columns = pruneMasterDuplicateColumns(columns, prev.sources ?? []);

      return {
        ...prev,
        group_by,
        columns,
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
        for (const col of columns) {
          const fieldMeta = findSourceSchema(schema, col.source)?.fields?.find((f) => f.key === col.field);
          if (!fieldMeta?.groupable) continue;
          if (fieldMeta.aggregates?.length) continue;
          if (group_by.some((g) => groupByMatches(g, col.source, col.field, prev.source))) continue;
          group_by = multi
            ? [...group_by, { source: col.source, field: col.field }]
            : [...group_by, col.field];
        }

        columns = columns.map((col) => {
          const colSource = col.source;
          const fieldMeta = findSourceSchema(schema, colSource)?.fields?.find((f) => f.key === col.field);
          const grouped = group_by.some((g) => groupByMatches(g, colSource, col.field, prev.source));

          if (grouped) {
            const { aggregate, ...rest } = col;
            return rest;
          }
          if (!fieldMeta?.aggregates?.length) {
            return { ...col, aggregate: col.aggregate ?? "max" };
          }
          return { ...col, aggregate: col.aggregate ?? fieldMeta.aggregates[0] };
        });
      }

      return { ...prev, group_by, columns: pruneMasterDuplicateColumns(columns, prev.sources ?? []) };
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
      const res = await runBackgroundTask(
        () =>
          queueReportBuilderPreview(spec, {
            per_page: 200,
            workspace_id: workspaceId,
          }),
        {
          label: "Building report preview",
          message: "Started fetching…",
        },
      );
      const rows = res.data ?? [];
      setPreviewRows(rows);
      if (rows.length === 0) {
        setPreviewFeedback({
          kind: "empty",
          message: emptyPreviewMessage(selectedSources),
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

  function applyAiSuggestion(suggestion) {
    const applied = applyReportBuilderSuggestion(suggestion, { name, description, spec });
    if (applied.name) setName(applied.name);
    if (applied.description != null) setDescription(applied.description);
    if (applied.spec) setSpec(applied.spec);
    setPreviewRows([]);
    setPreviewFeedback(null);
    setError(null);
  }

  const previewKeys = useMemo(() => {
    const rowKeys = previewRows[0] ? Object.keys(previewRows[0]) : [];
    return orderedReportBuilderPreviewKeys(spec.columns, rowKeys, filterReportColumnKeys);
  }, [previewRows, spec.columns]);

  function moveSelectedColumn(fromIndex, delta) {
    setSpec((prev) => ({
      ...prev,
      columns: moveReportBuilderColumn(prev.columns, fromIndex, delta),
    }));
  }

  const previewExportColumns = useMemo(() => {
    if (!previewRows[0]) return [];
    return previewKeys.map((key) => ({
      key,
      label: reportColumnLabel(key),
      accessor: (row) => (row[key] == null ? "—" : String(row[key])),
    }));
  }, [previewKeys, previewRows]);

  const blendLabel = availableBlendDimensions.find((d) => d.key === spec.blend_by)?.label;
  const normalizedGroupBy = spec.group_by.map((g) => normalizeGroupByEntry(g, spec.source));

  function renderColumnList(rows, emptyLabel) {
    if (!rows.length) {
      return <p className="text-xs text-slate-400">{emptyLabel}</p>;
    }
    return (
      <ul className="space-y-1.5">
        {rows.map(({ sourceKey, sourceLabel, field }) => {
          const selected = spec.columns.some((c) => c.source === sourceKey && c.field === field.key);
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
                {isMultiSource ? (
                  <span className="ml-1 text-xs text-slate-400">· {sourceLabel}</span>
                ) : null}
                {disabled ? (
                  <span className="ml-1 text-xs text-slate-400">— numbers only in side-by-side mode</span>
                ) : null}
              </label>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <CatalogPageShell
      title="Report builder"
      subtitle={`Describe what you need or pick sources and columns, then preview. Built from ${workspaceLabel.toLowerCase()}.`}
    >
      <AdminBreadcrumb items={[{ label: "Reports", href: "/reports" }, { label: "Report builder" }]} />

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-1">
          <ReportBuilderAiSuggest workspaceId={workspaceId} onApply={applyAiSuggestion} />

          <section className="theme-panel rounded-xl border p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">1. Start with a data source</h2>
            <p className="mt-1 text-xs text-slate-500">
              Choose what the report is about (sales, stock, suppliers…). Add related sources only if you need
              columns from them.
            </p>
            <input
              className={`${inputClassName()} mt-3`}
              placeholder="Search sources…"
              value={sourceQuery}
              onChange={(e) => setSourceQuery(e.target.value)}
            />
            {selectedSources.length > 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                Selected:{" "}
                {selectedSources
                  .map((key) => findSourceSchema(schema, key)?.label ?? key)
                  .join(", ")}
                {selectedSources.length >= sourceLimit ? ` (max ${sourceLimit})` : ""}
              </p>
            ) : null}
            <ul className="mt-3 max-h-52 space-y-3 overflow-y-auto text-sm">
              {sourcesByModule.length === 0 ? (
                <li className="text-slate-500">No sources match your search.</li>
              ) : (
                sourcesByModule.map(([module, sources]) => (
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
                ))
              )}
            </ul>
          </section>

          {isMultiSource && availableBlendDimensions.length ? (
            <section className="theme-panel rounded-xl border p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Optional: compare side-by-side</h2>
              <p className="mt-1 text-xs text-slate-500">
                Leave this off to combine sources into one table. Turn it on to align totals by day, month, or
                branch.
              </p>
              <Field label="Align by">
                <SearchableSelect
                  className={inputClassName()}
                  value={spec.blend_by ?? ""}
                  nativeEvent
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
                  options={[
                    { value: "", label: "Joined table (default)" },
                    ...availableBlendDimensions.map((dim) => ({
                      value: dim.key,
                      label: `Side-by-side by ${String(dim.label).toLowerCase()}`,
                    })),
                  ]}
                />
              </Field>
              {isBlendMode ? (
                <p className="mt-2 text-xs text-slate-500">
                  Metrics are totaled per {blendLabel?.toLowerCase() ?? "shared row"} and shown side by side.
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="theme-panel rounded-xl border p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">2. Pick columns</h2>
            <p className="mt-1 text-xs text-slate-500">
              Only fields from your selected sources. Shared labels (like product name) come from the main master
              source when it is selected.
            </p>
            <input
              className={`${inputClassName()} mt-3`}
              placeholder="Search columns…"
              value={columnQuery}
              onChange={(e) => setColumnQuery(e.target.value)}
              disabled={selectedSources.length === 0}
            />
            <div className="mt-3 max-h-80 space-y-4 overflow-y-auto text-sm">
              {selectedSources.length === 0 ? (
                <p className="text-slate-500">Select a data source above to see its columns.</p>
              ) : (
                <>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Labels</p>
                    {renderColumnList(dimensionColumns, "No label columns match.")}
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Numbers</p>
                    {renderColumnList(metricColumns, "No number columns match.")}
                  </div>
                  {otherColumns.length ? (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Other</p>
                      {renderColumnList(otherColumns, "")}
                    </div>
                  ) : null}
                </>
              )}
            </div>
            {spec.columns.length > 0 ? (
              <div className="mt-4 border-t border-slate-200 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected columns</p>
                <p className="mt-1 text-xs text-slate-500">Reorder with up/down — preview and exports follow this order.</p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {spec.columns.map((col, index) => {
                    const sourceLabel = findSourceSchema(schema, col.source)?.label ?? col.source;
                    return (
                      <li
                        key={`${col.source}:${col.field}:${index}`}
                        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5"
                      >
                        <span className="min-w-0 flex-1 truncate text-slate-800">
                          <span className="font-medium">{col.label ?? col.field}</span>
                          {isMultiSource ? (
                            <span className="ml-1 text-xs text-slate-400">· {sourceLabel}</span>
                          ) : null}
                          {col.aggregate ? (
                            <span className="ml-1 text-xs uppercase text-slate-400">{col.aggregate}</span>
                          ) : null}
                        </span>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            className="rounded px-1.5 py-0.5 text-xs font-medium text-slate-600 hover:bg-white disabled:opacity-40"
                            disabled={index === 0}
                            aria-label="Move column up"
                            onClick={() => moveSelectedColumn(index, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="rounded px-1.5 py-0.5 text-xs font-medium text-slate-600 hover:bg-white disabled:opacity-40"
                            disabled={index === spec.columns.length - 1}
                            aria-label="Move column down"
                            onClick={() => moveSelectedColumn(index, 1)}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="rounded px-1.5 py-0.5 text-xs font-medium text-red-600 hover:bg-white"
                            aria-label="Remove column"
                            onClick={() => toggleColumn(col.source, col.field)}
                          >
                            ×
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </section>

          {!isBlendMode && selectedSources.length > 0 ? (
            <section className="theme-panel rounded-xl border p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">3. Group by (optional)</h2>
              <p className="mt-1 text-xs text-slate-500">Summarize rows — e.g. totals per branch or product.</p>
              <ul className="mt-3 max-h-40 space-y-2 overflow-y-auto text-sm">
                {selectedSources.flatMap((sourceKey) => {
                  const sourceSchema = findSourceSchema(schema, sourceKey);
                  return reportBuilderVisibleFields(sourceSchema, selectedSources)
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
                          {isMultiSource ? `${sourceSchema?.label}: ` : ""}
                          {field.label}
                        </label>
                      </li>
                    ));
                })}
              </ul>
            </section>
          ) : null}

          <section className="theme-panel rounded-xl border p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Save</h2>
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

          {templates.length > 0 ? (
            <section className="theme-panel rounded-xl border p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Saved reports</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {templates.slice(0, 8).map((t) => (
                  <li key={t.id}>
                    <Link className="text-indigo-700 hover:underline" href={`/reports/custom/${t.id}`}>
                      {t.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="xl:col-span-2">
          <section className="theme-panel rounded-xl border p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Preview</h2>
                <p className="text-xs text-slate-500">
                  {selectedSources.length} source(s) · {spec.columns.length} column(s)
                  {normalizedGroupBy.length ? ` · grouped by ${normalizedGroupBy.length}` : ""}
                  {isBlendMode && blendLabel ? ` · side-by-side by ${blendLabel.toLowerCase()}` : ""}
                </p>
              </div>
              {previewRows.length > 0 ? (
                <ReportExportToolbar
                  filename={name.trim() || "report-preview"}
                  title={name.trim() || "Report preview"}
                  subtitle={description.trim() || workspaceLabel}
                  columns={previewExportColumns}
                  getRows={async () => previewRows}
                  disabled={previewLoading}
                />
              ) : null}
            </div>

            <PreviewFeedback feedback={previewFeedback} />

            {previewLoading ? (
              <p className="mt-6 text-sm text-slate-500">Building preview…</p>
            ) : previewRows.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      {previewKeys.map((key) => (
                        <th key={key} className="px-3 py-2 font-semibold">
                          {reportColumnLabel(key)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.slice(0, 50).map((row, idx) => (
                      <tr key={idx} className="border-b border-slate-100">
                        {previewKeys.map((key) => (
                          <td key={key} className="px-3 py-2 text-slate-800">
                            {row[key] == null || row[key] === "" ? "—" : String(row[key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewRows.length > 50 ? (
                  <p className="mt-2 text-xs text-slate-400">Showing first 50 of {previewRows.length} rows.</p>
                ) : null}
              </div>
            ) : (
              <p className="mt-6 text-sm text-slate-500">
                {selectedSources.length === 0
                  ? "Select a data source, choose columns, then click Preview."
                  : "Select columns and click Preview."}
              </p>
            )}
          </section>
        </div>
      </div>
    </CatalogPageShell>
  );
}
