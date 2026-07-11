"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { PrimaryButton, SECONDARY_BTN_CLASS, inputClassName } from "@/components/catalog/catalog-shared";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";

const emptyForm = () => ({
  id: null,
  title: "",
  keywordsText: "",
  response_text: "",
  match_mode: "any",
  priority: 100,
  is_active: true,
});

function keywordsToText(keywords) {
  return Array.isArray(keywords) ? keywords.join(", ") : "";
}

export function WhatsappTrainingPanel() {
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [previewMessage, setPreviewMessage] = useState("");
  const [previewResult, setPreviewResult] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/whatsapp/training", { loading: false });
      setRows(res.data ?? []);
    } catch (err) {
      setRows([]);
      notifyError(err instanceof ApiError ? err.message : "Failed to load training replies.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function editRow(row) {
    setForm({
      id: row.id,
      title: row.title || "",
      keywordsText: keywordsToText(row.keywords),
      response_text: row.response_text || "",
      match_mode: row.match_mode === "all" ? "all" : "any",
      priority: Number(row.priority ?? 100),
      is_active: row.is_active !== false,
    });
  }

  function resetForm() {
    setForm(emptyForm());
  }

  async function saveForm(e) {
    e?.preventDefault?.();
    if (!form.keywordsText.trim() || !form.response_text.trim()) {
      notifyError("Keywords and response text are required.");
      return;
    }
    setSaving(true);
    try {
      const body = {
        title: form.title.trim() || null,
        keywords: form.keywordsText,
        response_text: form.response_text.trim(),
        match_mode: form.match_mode,
        priority: Number(form.priority) || 100,
        is_active: Boolean(form.is_active),
      };
      if (form.id) {
        await apiRequest(`/admin/whatsapp/training/${form.id}`, { method: "PATCH", body });
        notifySuccess("Training reply updated.");
      } else {
        await apiRequest("/admin/whatsapp/training", { method: "POST", body });
        notifySuccess("Training reply saved.");
      }
      resetForm();
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save training reply.");
    } finally {
      setSaving(false);
    }
  }

  async function removeRow(row) {
    const ok = await confirm({
      title: "Delete training reply?",
      message: `Remove “${row.title || row.keywords?.[0] || "this reply"}”? The bot will stop matching these keywords.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/admin/whatsapp/training/${row.id}`, { method: "DELETE" });
      if (form.id === row.id) resetForm();
      notifySuccess("Training reply deleted.");
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not delete training reply.");
    }
  }

  async function runPreview() {
    if (!previewMessage.trim()) {
      notifyError("Enter a sample customer message to test.");
      return;
    }
    setPreviewBusy(true);
    setPreviewResult(null);
    try {
      const res = await apiRequest("/admin/whatsapp/training/preview", {
        method: "POST",
        body: { message: previewMessage.trim() },
        loading: false,
      });
      setPreviewResult(res);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Preview failed.");
    } finally {
      setPreviewBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="theme-panel rounded-xl border p-6 shadow-sm">
        <h2 className="text-sm font-semibold theme-heading">Train WhatsApp replies</h2>
        <p className="mt-1 text-sm theme-subtext">
          When a customer sends something the ordering flow does not understand, the bot scans these
          keyword → response rules and replies with the best match. Rules apply to every organization
          using platform WhatsApp. Product search and menu commands still take priority.
        </p>

        <form onSubmit={saveForm} className="mt-4 grid gap-3 lg:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Title (optional)</span>
            <input
              className={inputClassName()}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Opening hours"
              disabled={saving}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Priority</span>
            <input
              type="number"
              min={0}
              max={9999}
              className={inputClassName()}
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              disabled={saving}
            />
            <span className="mt-1 block text-xs theme-subtext">Higher priority wins when scores tie.</span>
          </label>
          <label className="block text-sm lg:col-span-2">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Keywords (comma or new line separated)
            </span>
            <textarea
              className={`${inputClassName()} min-h-[4.5rem]`}
              value={form.keywordsText}
              onChange={(e) => setForm((f) => ({ ...f, keywordsText: e.target.value }))}
              placeholder="hours, open, closing time, when do you open"
              disabled={saving}
            />
          </label>
          <label className="block text-sm lg:col-span-2">
            <span className="mb-1 block text-xs font-medium text-slate-600">Bot response</span>
            <textarea
              className={`${inputClassName()} min-h-[7rem]`}
              value={form.response_text}
              onChange={(e) => setForm((f) => ({ ...f, response_text: e.target.value }))}
              placeholder="We are open Mon–Sat 8am–6pm. Reply MENU to order."
              disabled={saving}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-xs font-medium text-slate-600">Match mode</span>
            <select
              className={inputClassName()}
              value={form.match_mode}
              onChange={(e) => setForm((f) => ({ ...f, match_mode: e.target.value }))}
              disabled={saving}
            >
              <option value="any">Any keyword</option>
              <option value="all">All keywords</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              disabled={saving}
            />
            <span>Active</span>
          </label>
          <div className="flex flex-wrap gap-2 lg:col-span-2">
            <PrimaryButton type="submit" showIcon={false} disabled={saving}>
              {saving ? "Saving…" : form.id ? "Update reply" : "Add reply"}
            </PrimaryButton>
            {form.id ? (
              <button type="button" className={SECONDARY_BTN_CLASS} onClick={resetForm} disabled={saving}>
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="theme-panel rounded-xl border p-6 shadow-sm">
        <h2 className="text-sm font-semibold theme-heading">Try a message</h2>
        <p className="mt-1 text-sm theme-subtext">
          Test how the bot would pick a trained reply without sending WhatsApp or touching an org.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className={`${inputClassName()} min-w-[16rem] flex-1`}
            value={previewMessage}
            onChange={(e) => setPreviewMessage(e.target.value)}
            placeholder="e.g. What time do you open?"
            disabled={previewBusy}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void runPreview();
              }
            }}
          />
          <PrimaryButton type="button" showIcon={false} disabled={previewBusy} onClick={() => void runPreview()}>
            {previewBusy ? "…" : "Preview"}
          </PrimaryButton>
        </div>
        {previewResult ? (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
            {previewResult.matched ? (
              <>
                <p className="font-medium text-emerald-800">Matched</p>
                <p className="mt-1 whitespace-pre-wrap">{previewResult.reply}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Keywords: {(previewResult.match?.matched_keywords || []).join(", ") || "—"}
                  {previewResult.match?.title ? ` · ${previewResult.match.title}` : ""}
                </p>
              </>
            ) : (
              <p className="text-amber-900">No training reply matched this message.</p>
            )}
          </div>
        ) : null}
      </section>

      <section className="theme-panel rounded-xl border p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold theme-heading">Saved replies</h2>
          <button type="button" className={SECONDARY_BTN_CLASS} onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
        </div>
        {loading ? (
          <p className="mt-3 text-sm theme-subtext">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="mt-3 text-sm theme-subtext">
            No training replies yet. Add keywords for FAQs like delivery areas, payment methods, or
            business hours.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">
                    {row.title || "Untitled"}
                    {!row.is_active ? (
                      <span className="ml-2 rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                        Off
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {(row.keywords || []).join(", ")} · {row.match_mode === "all" ? "all keywords" : "any keyword"} ·
                    priority {row.priority}
                  </p>
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-slate-700">{row.response_text}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" className={SECONDARY_BTN_CLASS} onClick={() => editRow(row)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className={`${SECONDARY_BTN_CLASS} text-rose-700`}
                    onClick={() => void removeRow(row)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
