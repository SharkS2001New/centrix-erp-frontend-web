"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetchBlob, apiRequest, apiUploadForm, ApiError, lpoAttachmentFilePath } from "@/lib/api";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { confirmDeleteOptions, useConfirm } from "@/lib/use-confirm";

function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function LpoAttachmentsPanel({ lpoNo }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewingId, setViewingId] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/lpo-attachments", {
        searchParams: { "filter[lpo_no]": lpoNo, per_page: 50 },
      });
      setRows(res.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load attachments");
    } finally {
      setLoading(false);
    }
  }, [lpoNo]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(e) {
    e.preventDefault();
    if (!file) return;
    setSaving(true);
    setError(null);
    try {
      await apiUploadForm("/lpo-attachments", { lpo_no: Number(lpoNo), file });
      setFile(null);
      e.target.reset();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to upload attachment");
    } finally {
      setSaving(false);
    }
  }

  async function viewAttachment(row) {
    if (!row.file_path) {
      setError("This attachment has no stored file (legacy reference only).");
      return;
    }
    setViewingId(row.id);
    setError(null);
    try {
      const blob = await apiFetchBlob(lpoAttachmentFilePath(row.id));
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open file");
    } finally {
      setViewingId(null);
    }
  }

  async function remove(id) {
    const ok = await confirm(confirmDeleteOptions("this attachment"));
    if (!ok) return;
    await apiRequest(`/lpo-attachments/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <section className="theme-panel rounded-xl border p-6 shadow-sm">
      <h2 className="theme-heading font-medium">Attachments</h2>
      <p className="theme-subtext mt-1 text-xs">Upload supplier quotes, invoices, and supporting documents.</p>
      {error ? <p className="theme-alert-error mt-2 rounded-lg px-3 py-2 text-sm">{error}</p> : null}
      {loading ? (
        <p className="theme-subtext mt-3 text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="theme-subtext mt-3 text-sm">No attachments yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--theme-border)] text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <p className="theme-heading font-medium">{r.file_name}</p>
                <p className="theme-subtext text-xs">
                  {r.file_path ? formatFileSize(r.file_size) : "Reference only"}
                  {r.created_at ? ` · ${new Date(r.created_at).toLocaleString()}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {r.file_path ? (
                  <button
                    type="button"
                    disabled={viewingId === r.id}
                    onClick={() => void viewAttachment(r)}
                    className="theme-link hover:underline disabled:opacity-50"
                  >
                    {viewingId === r.id ? "Opening…" : "View"}
                  </button>
                ) : null}
                <button type="button" onClick={() => remove(r.id)} className="text-red-600 hover:underline">
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={upload} className="mt-4 flex flex-wrap items-end gap-3">
        <Field label="File">
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
            className={inputClassName()}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </Field>
        <PrimaryButton type="submit" disabled={saving || !file} showIcon={false}>
          {saving ? "Uploading…" : "Upload"}
        </PrimaryButton>
      </form>
    </section>
  );
}
