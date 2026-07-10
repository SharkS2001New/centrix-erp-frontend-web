"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  CatalogPageShell,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
} from "@/components/catalog/catalog-shared";
import { PLATFORM_INVOICE_DESIGN_TEMPLATES } from "@/lib/platform-invoices";
import { useConfirm } from "@/lib/use-confirm";

function designLabel(templateId) {
  return PLATFORM_INVOICE_DESIGN_TEMPLATES.find((row) => row.id === templateId)?.label ?? templateId ?? "—";
}

export default function PlatformInvoiceTemplatesPage() {
  const confirm = useConfirm();
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/platform-invoices/saved-templates");
      setSavedTemplates(res.data ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load templates.");
      setSavedTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete(template) {
    const ok = await confirm({
      title: "Delete template?",
      message: `Remove “${template.name}”? New invoices will no longer be able to load it.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    setDeletingId(template.id);
    try {
      await apiRequest(`/admin/platform-invoices/saved-templates/${template.id}`, {
        method: "DELETE",
      });
      notifySuccess("Template deleted.");
      setSavedTemplates((prev) => prev.filter((row) => row.id !== template.id));
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to delete template.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <CatalogPageShell
      title="Invoice templates"
      subtitle="Design layouts for how invoices look, plus saved content templates for recurring billing packages."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className={SECONDARY_BTN_CLASS}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <Link href="/platform/invoices/new">
            <PrimaryButton type="button">New invoice</PrimaryButton>
          </Link>
        </div>
      }
    >
      <AdminBreadcrumb
        items={[
          { label: "Platform", href: "/platform" },
          { label: "Invoices", href: "/platform/invoices" },
          { label: "Templates" },
        ]}
      />

      <section className="theme-panel mb-6 rounded-xl border p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Design templates</h2>
            <p className="mt-1 text-sm text-slate-500">
              Visual layouts applied when you create or edit a platform invoice. Pick one on the invoice form.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PLATFORM_INVOICE_DESIGN_TEMPLATES.map((tpl) => (
            <div
              key={tpl.id}
              className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40"
            >
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{tpl.label}</p>
              <p className="mt-1 text-xs text-slate-500">{tpl.description}</p>
              <p className="mt-3 font-mono text-[11px] text-slate-400">{tpl.id}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="theme-panel rounded-xl border shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Saved templates</h2>
          <p className="mt-1 text-sm text-slate-500">
            Reusable line items, modules, notes, and design choice. Save from any invoice with{" "}
            <strong>Save as template</strong>, then load them when billing the next tenant.
          </p>
        </div>

        {loading ? (
          <p className="px-5 py-8 text-sm text-slate-500">Loading templates…</p>
        ) : savedTemplates.length === 0 ? (
          <div className="px-5 py-8 text-sm text-slate-500">
            <p>No saved templates yet.</p>
            <p className="mt-2">
              Open{" "}
              <Link href="/platform/invoices/new" className="font-medium text-[#185FA5] hover:underline">
                New invoice
              </Link>
              , set up modules and lines, then click <strong>Save as template</strong>.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Design</th>
                  <th className="px-5 py-3">Lines</th>
                  <th className="px-5 py-3">VAT %</th>
                  <th className="px-5 py-3">Updated</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {savedTemplates.map((tpl) => {
                  const lineCount = Array.isArray(tpl.line_items)
                    ? tpl.line_items.filter((row) => row.included !== false).length
                    : 0;
                  return (
                    <tr key={tpl.id}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">{tpl.name}</p>
                        {tpl.description ? (
                          <p className="mt-0.5 text-xs text-slate-500">{tpl.description}</p>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 text-slate-600">{designLabel(tpl.template_id)}</td>
                      <td className="px-5 py-3 tabular-nums text-slate-600">{lineCount}</td>
                      <td className="px-5 py-3 tabular-nums text-slate-600">
                        {tpl.tax_rate != null ? Number(tpl.tax_rate) : "—"}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {tpl.updated_at
                          ? new Date(tpl.updated_at).toLocaleString()
                          : tpl.created_at
                            ? new Date(tpl.created_at).toLocaleString()
                            : "—"}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Link
                            href={`/platform/invoices/new?template=${encodeURIComponent(tpl.id)}`}
                            className="text-sm font-medium text-[#185FA5] hover:underline"
                          >
                            Use for new invoice
                          </Link>
                          <button
                            type="button"
                            disabled={deletingId === tpl.id}
                            className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
                            onClick={() => void handleDelete(tpl)}
                          >
                            {deletingId === tpl.id ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </CatalogPageShell>
  );
}
