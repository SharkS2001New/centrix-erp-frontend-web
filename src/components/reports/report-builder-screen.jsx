"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { CatalogPageShell, Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { AiAssistPanel } from "@/components/ai/ai-assist-panel";

function emptySpec(sourceKey) {
  return {
    source: sourceKey,
    columns: [],
    group_by: [],
    sort: null,
    charts: [],
    kpis: [],
  };
}

export function ReportBuilderScreen() {
  const router = useRouter();
  const [schema, setSchema] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [spec, setSpec] = useState(emptySpec("sales"));

  useEffect(() => {
    Promise.all([apiRequest("/reports/builder/schema"), apiRequest("/reports/builder/templates")])
      .then(([schemaRes, templatesRes]) => {
        setSchema(schemaRes);
        setTemplates(templatesRes.data ?? []);
        if (schemaRes.sources?.[0]?.key) {
          setSpec(emptySpec(schemaRes.sources[0].key));
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load builder"));
  }, []);

  const currentSource = useMemo(
    () => schema?.sources?.find((s) => s.key === spec.source),
    [schema, spec.source],
  );

  function setSource(sourceKey) {
    setSpec(emptySpec(sourceKey));
    setPreviewRows([]);
  }

  function toggleColumn(fieldKey) {
    setSpec((prev) => {
      const exists = prev.columns.find((c) => c.field === fieldKey);
      if (exists) {
        return {
          ...prev,
          columns: prev.columns.filter((c) => c.field !== fieldKey),
          group_by: prev.group_by.filter((g) => g !== fieldKey),
        };
      }
      const field = currentSource?.fields?.find((f) => f.key === fieldKey);
      if (!field) return prev;
      return {
        ...prev,
        columns: [
          ...prev.columns,
          {
            field: fieldKey,
            label: field.label,
            ...(prev.group_by.length && !field.groupable ? { aggregate: field.aggregates?.[0] ?? "sum" } : {}),
          },
        ],
      };
    });
  }

  function toggleGroupBy(fieldKey) {
    setSpec((prev) => {
      const inGroup = prev.group_by.includes(fieldKey);
      const group_by = inGroup ? prev.group_by.filter((g) => g !== fieldKey) : [...prev.group_by, fieldKey];
      let columns = [...prev.columns];
      if (!inGroup && !columns.find((c) => c.field === fieldKey)) {
        const field = currentSource?.fields?.find((f) => f.key === fieldKey);
        if (field) columns.push({ field: fieldKey, label: field.label });
      }
      if (group_by.length) {
        columns = columns.map((col) => {
          const field = currentSource?.fields?.find((f) => f.key === col.field);
          if (group_by.includes(col.field)) {
            const { aggregate, ...rest } = col;
            return rest;
          }
          if (!field?.aggregates?.length) return col;
          return { ...col, aggregate: col.aggregate ?? field.aggregates[0] };
        });
      }
      return { ...prev, group_by, columns };
    });
  }

  async function runPreview() {
    setPreviewLoading(true);
    setError(null);
    try {
      const res = await apiRequest("/reports/builder/preview", {
        method: "POST",
        body: { spec, per_page: 25 },
      });
      setPreviewRows(res.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
      setPreviewRows([]);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function saveTemplate() {
    if (!name.trim()) {
      setError("Enter a report name.");
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
        body: { name: name.trim(), description: description.trim() || null, spec, is_shared: isShared },
      });
      router.push(`/reports/custom/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const previewKeys = previewRows[0] ? Object.keys(previewRows[0]) : spec.columns.map((c) => c.alias ?? c.field);

  return (
    <CatalogPageShell title="Report builder" subtitle="Compose custom reports from allowlisted ERP fields.">
      <AdminBreadcrumb items={[{ label: "Reports", href: "/reports" }, { label: "Report builder" }]} />

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-1">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">1. Data source</h2>
            <Field label="Source">
              <select
                className={inputClassName()}
                value={spec.source}
                onChange={(e) => setSource(e.target.value)}
              >
                {(schema?.sources ?? []).map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            {currentSource?.description ? (
              <p className="mt-2 text-xs text-slate-500">{currentSource.description}</p>
            ) : null}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">2. Columns</h2>
            <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-sm">
              {(currentSource?.fields ?? []).map((field) => {
                const selected = spec.columns.some((c) => c.field === field.key);
                return (
                  <li key={field.key} className="flex items-start gap-2">
                    <input
                      id={`col-${field.key}`}
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleColumn(field.key)}
                      className="mt-1"
                    />
                    <label htmlFor={`col-${field.key}`} className="min-w-0 flex-1 cursor-pointer">
                      <span className="font-medium text-slate-800">{field.label}</span>
                      <span className="ml-1 text-xs text-slate-400">({field.type})</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">3. Group by (optional)</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {(currentSource?.fields ?? [])
                .filter((f) => f.groupable)
                .map((field) => (
                  <li key={field.key} className="flex items-center gap-2">
                    <input
                      id={`grp-${field.key}`}
                      type="checkbox"
                      checked={spec.group_by.includes(field.key)}
                      onChange={() => toggleGroupBy(field.key)}
                    />
                    <label htmlFor={`grp-${field.key}`} className="cursor-pointer text-slate-700">
                      {field.label}
                    </label>
                  </li>
                ))}
            </ul>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">4. Save template</h2>
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
                <PrimaryButton type="button" onClick={runPreview} disabled={previewLoading || !spec.columns.length}>
                  {previewLoading ? "Previewing…" : "Preview"}
                </PrimaryButton>
                <PrimaryButton type="button" onClick={saveTemplate} disabled={saving || !spec.columns.length}>
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
              {spec.columns.length} column(s)
              {spec.group_by.length ? ` · grouped by ${spec.group_by.length} field(s)` : ""}
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
            ) : (
              <p className="mt-4 text-sm text-slate-500">Select columns and click Preview.</p>
            )}
          </section>
        </div>
      </div>

      <AiAssistPanel context="report_builder" title="Report builder assistant" />
    </CatalogPageShell>
  );
}
