"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  CatalogPageShell,
  Field,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { notifyError, notifySuccess } from "@/lib/notify";

const EMPTY_FORM = {
  title: "",
  body: "",
  link_url: "",
  audience: "all_users",
  organization_ids: [],
  workspace_ids: [],
  show_on_login: true,
  targets_all_organizations: true,
};

function StatusPill({ status }) {
  const published = status === "published";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
        published
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
      }`}
    >
      {published ? "Published" : "Draft"}
    </span>
  );
}

function toggleId(list, id) {
  const key = String(id);
  if (list.map(String).includes(key)) {
    return list.filter((item) => String(item) !== key);
  }
  return [...list, id];
}

export function PlatformWhatsNewScreen() {
  const [notes, setNotes] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishingId, setPublishingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [orgSearch, setOrgSearch] = useState("");

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const [notesRes, orgsRes] = await Promise.all([
        apiRequest("/admin/whats-new", { loading: false }),
        apiRequest("/admin/organizations", { loading: false }),
      ]);
      setNotes(notesRes?.data ?? []);
      setWorkspaces(notesRes?.workspaces ?? []);
      setOrganizations(orgsRes?.data ?? []);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to load What’s new notes.");
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const filteredOrgs = useMemo(() => {
    const q = orgSearch.trim().toLowerCase();
    if (!q) return organizations;
    return organizations.filter((org) => {
      const hay = `${org.org_name ?? ""} ${org.company_code ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [organizations, orgSearch]);

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function startEdit(note) {
    setEditingId(note.id);
    setForm({
      title: note.title ?? "",
      body: note.body ?? "",
      link_url: note.link_url ?? "",
      audience: note.audience ?? "all_users",
      organization_ids: note.organization_ids ?? [],
      workspace_ids: note.workspace_ids ?? [],
      show_on_login: note.show_on_login !== false,
      targets_all_organizations: note.targets_all_organizations !== false,
    });
  }

  async function saveNote() {
    if (!form.title.trim() || !form.body.trim()) {
      notifyError("Title and body are required.");
      return;
    }
    if (!form.workspace_ids.length) {
      notifyError("Select at least one module / workspace.");
      return;
    }
    if (!form.targets_all_organizations && !form.organization_ids.length) {
      notifyError("Select at least one organization, or target all organizations.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        body: form.body.trim(),
        link_url: form.link_url.trim() || null,
        audience: form.audience,
        organization_ids: form.targets_all_organizations ? [] : form.organization_ids,
        workspace_ids: form.workspace_ids,
        show_on_login: Boolean(form.show_on_login),
      };

      if (editingId) {
        await apiRequest(`/admin/whats-new/${editingId}`, {
          method: "PATCH",
          body: payload,
        });
        notifySuccess("Note updated.");
      } else {
        await apiRequest("/admin/whats-new", {
          method: "POST",
          body: payload,
        });
        notifySuccess("Draft saved.");
      }
      startCreate();
      await loadNotes();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to save note.");
    } finally {
      setSaving(false);
    }
  }

  async function publishNote(id) {
    setPublishingId(id);
    try {
      await apiRequest(`/admin/whats-new/${id}/publish`, { method: "POST" });
      notifySuccess("Published — notifications are being sent to matching users.");
      await loadNotes();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Publish failed.");
    } finally {
      setPublishingId(null);
    }
  }

  async function deleteNote(id) {
    try {
      await apiRequest(`/admin/whats-new/${id}`, { method: "DELETE" });
      notifySuccess("Draft deleted.");
      if (editingId === id) startCreate();
      await loadNotes();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  return (
    <CatalogPageShell
      title="What’s new"
      subtitle="Announce Centrix updates to the right organizations and modules. Publish sends an in-app bell notification; optional login chip shows once until dismissed."
    >
      <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "What’s new" }]} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="theme-panel rounded-xl border p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">
              {editingId ? "Edit note" : "New note"}
            </h2>
            {editingId ? (
              <button type="button" className={SECONDARY_BTN_CLASS} onClick={startCreate}>
                Clear
              </button>
            ) : null}
          </div>

          <div className="space-y-4">
            <Field label="Title">
              <input
                className={inputClassName()}
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                maxLength={200}
                placeholder="Short headline"
              />
            </Field>
            <Field label="Body">
              <textarea
                className={`${inputClassName()} min-h-[120px]`}
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                maxLength={10000}
                placeholder="What changed and why it matters…"
              />
            </Field>
            <Field label="Optional link">
              <input
                className={inputClassName()}
                value={form.link_url}
                onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value }))}
                placeholder="https://…"
              />
            </Field>

            <Field label="Audience">
              <select
                className={inputClassName()}
                value={form.audience}
                onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}
              >
                <option value="all_users">All matching users</option>
                <option value="admins_only">Organization admins only</option>
              </select>
            </Field>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Modules / workspaces
              </p>
              <div className="flex flex-wrap gap-2">
                {workspaces.map((ws) => {
                  const selected = form.workspace_ids.includes(ws.id);
                  return (
                    <button
                      key={ws.id}
                      type="button"
                      title={ws.description || ws.label}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          workspace_ids: toggleId(f.workspace_ids, ws.id),
                        }))
                      }
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                        selected
                          ? "border-[#185FA5] bg-[#E6F1FB] text-[#185FA5]"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {ws.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Organizations
              </p>
              <label className="mb-2 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.targets_all_organizations}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      targets_all_organizations: e.target.checked,
                      organization_ids: e.target.checked ? [] : f.organization_ids,
                    }))
                  }
                />
                All tenant organizations
              </label>
              {!form.targets_all_organizations ? (
                <div className="space-y-2">
                  <input
                    className={inputClassName()}
                    value={orgSearch}
                    onChange={(e) => setOrgSearch(e.target.value)}
                    placeholder="Search organizations…"
                  />
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 p-2">
                    {filteredOrgs.length === 0 ? (
                      <p className="px-1 py-2 text-xs text-slate-500">No organizations found.</p>
                    ) : (
                      filteredOrgs.map((org) => {
                        const selected = form.organization_ids.map(Number).includes(Number(org.id));
                        return (
                          <label
                            key={org.id}
                            className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-slate-50"
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() =>
                                setForm((f) => ({
                                  ...f,
                                  organization_ids: toggleId(f.organization_ids, org.id),
                                }))
                              }
                            />
                            <span className="min-w-0 truncate">
                              {org.org_name}
                              <span className="ml-1 text-xs text-slate-400">{org.company_code}</span>
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.show_on_login}
                onChange={(e) => setForm((f) => ({ ...f, show_on_login: e.target.checked }))}
              />
              Show “New in Centrix” chip on first login (dismissible once)
            </label>

            <div className="flex flex-wrap gap-2 pt-1">
              <PrimaryButton type="button" disabled={saving} onClick={() => void saveNote()}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Save draft"}
              </PrimaryButton>
            </div>
          </div>
        </section>

        <section className="theme-panel rounded-xl border p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Notes</h2>
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : notes.length === 0 ? (
            <p className="text-sm text-slate-500">No notes yet. Create a draft on the left.</p>
          ) : (
            <ul className="space-y-3">
              {notes.map((note) => (
                <li key={note.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-slate-900">{note.title}</p>
                        <StatusPill status={note.status} />
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{note.body}</p>
                      <p className="mt-2 text-xs text-slate-400">
                        {(note.workspaces ?? []).map((w) => w.label).join(" · ") || "No modules"}
                        {" · "}
                        {note.targets_all_organizations
                          ? "All orgs"
                          : `${(note.organization_ids ?? []).length} org(s)`}
                        {" · "}
                        {note.audience === "admins_only" ? "Admins only" : "All users"}
                        {note.status === "published"
                          ? ` · Notified ${note.notified_count ?? 0}`
                          : null}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={SECONDARY_BTN_CLASS}
                      onClick={() => startEdit(note)}
                    >
                      Edit
                    </button>
                    {note.status === "draft" ? (
                      <>
                        <PrimaryButton
                          type="button"
                          disabled={publishingId === note.id}
                          onClick={() => void publishNote(note.id)}
                        >
                          {publishingId === note.id ? "Publishing…" : "Publish"}
                        </PrimaryButton>
                        <button
                          type="button"
                          className={`${SECONDARY_BTN_CLASS} text-red-700`}
                          onClick={() => void deleteNote(note.id)}
                        >
                          Delete
                        </button>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </CatalogPageShell>
  );
}
