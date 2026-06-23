"use client";

import { useCallback, useEffect, useState } from "react";
import {
  apiFetchBlob,
  apiRequest,
  apiUploadForm,
  ApiError,
  employeeDocumentFilePath,
} from "@/lib/api";
import { Field, FormModal, inputClassName } from "@/components/catalog/catalog-shared";

const DOC_TYPES = [
  { value: "contract", label: "Employment contract" },
  { value: "national_id", label: "National ID copy" },
  { value: "passport", label: "Passport" },
  { value: "kra_pin", label: "KRA PIN" },
  { value: "offer_letter", label: "Offer letter" },
  { value: "certificate", label: "Certificate" },
  { value: "other", label: "Other" },
];

export function EmployeeDocuments({ employeeId }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState("other");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [viewingId, setViewingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await apiRequest(`/employees/${employeeId}/documents`);
      setDocs(Array.isArray(list) ? list : []);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(e) {
    e.preventDefault();
    if (!file || !title.trim()) {
      setError("Title and file are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiUploadForm(`/employees/${employeeId}/documents`, {
        title: title.trim(),
        document_type: documentType,
        file,
      });
      setModalOpen(false);
      setTitle("");
      setFile(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  async function viewDocument(doc) {
    setViewingId(doc.id);
    setError(null);
    try {
      const blob = await apiFetchBlob(employeeDocumentFilePath(employeeId, doc.id));
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open document");
    } finally {
      setViewingId(null);
    }
  }

  async function remove(doc) {
    if (!confirm(`Delete "${doc.title}"?`)) return;
    await apiRequest(`/employees/${employeeId}/documents/${doc.id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="theme-panel rounded-xl border p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-medium text-slate-900">Documents</h2>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setModalOpen(true);
          }}
          className="text-sm font-medium text-[#185FA5] hover:text-[#144f8a]"
        >
          Upload
        </button>
      </div>
      {error && !modalOpen ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="mt-3 text-sm text-slate-500">Loading documents…</p>
      ) : docs.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No documents stored yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium text-slate-800">{doc.title}</p>
                <p className="text-xs text-slate-500 capitalize">
                  {doc.document_type?.replace(/_/g, " ")} · {doc.file_name}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => viewDocument(doc)}
                  disabled={viewingId === doc.id}
                  className="text-[#185FA5] hover:underline disabled:opacity-50"
                >
                  {viewingId === doc.id ? "Opening…" : "View"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(doc)}
                  className="text-red-600 hover:underline"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <FormModal
        title="Upload document"
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={upload}
        saving={saving}
        error={error}
        submitLabel="Upload"
      >
        <Field label="Title">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className={inputClassName()}
          />
        </Field>
        <Field label="Document type">
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            className={inputClassName()}
          >
            {DOC_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="File (PDF, image, Word — max 10MB)">
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
            className="block w-full text-sm text-slate-600"
          />
        </Field>
      </FormModal>
    </div>
  );
}
