"use client";

import { useCallback, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { notifyError, notifySuccess } from "@/lib/notify";
import { isHospitalityServiceEnabled } from "@/lib/hospitality-services";
import {
  CatalogPageShell,
  Field,
  FormDrawer,
  inputClassName,
  PrimaryButton,
  SearchableSelect,
  SecondaryButton,
  TABLE_BODY_ROW_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_SHELL_CLASS,
} from "@/components/catalog/catalog-shared";

export function HospitalityOutletsScreen() {
  const { capabilities } = useAuth();
  const extraEnabled = isHospitalityServiceEnabled(capabilities, "extra_outlets");
  const tablesEnabled = isHospitalityServiceEnabled(capabilities, "floor_tables");
  const [outlets, setOutlets] = useState([]);
  const [tables, setTables] = useState([]);
  const [selectedOutletId, setSelectedOutletId] = useState("");
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ code: "", name: "", outlet_type: "bar", is_active: true });
  const [tableForm, setTableForm] = useState({ code: "", label: "", seats: "4", zone: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiRequest("/hospitality/outlets");
      const list = res?.data ?? [];
      setOutlets(list);
      const outletId = selectedOutletId || list[0]?.id;
      if (outletId) setSelectedOutletId(String(outletId));
      if (tablesEnabled && outletId) {
        const t = await apiRequest("/hospitality/floor-tables", {
          searchParams: { outlet_id: outletId },
        });
        setTables(t?.data ?? []);
      } else {
        setTables([]);
      }
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load outlets");
    } finally {
      setLoading(false);
    }
  }, [selectedOutletId, tablesEnabled]);

  useTabAwareDataLoad(load);

  async function saveOutlet(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await apiRequest(`/hospitality/outlets/${editingId}`, {
          method: "PATCH",
          body: {
            name: form.name.trim(),
            outlet_type: form.outlet_type,
            is_active: form.is_active,
            ...(form.code ? { code: form.code.trim() } : {}),
          },
        });
        notifySuccess("Outlet updated");
      } else {
        await apiRequest("/hospitality/outlets", {
          method: "POST",
          body: {
            code: form.code.trim(),
            name: form.name.trim(),
            outlet_type: form.outlet_type,
          },
        });
        notifySuccess("Outlet created");
      }
      setDrawerOpen(false);
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveTable(e) {
    e.preventDefault();
    if (!selectedOutletId) return;
    setSaving(true);
    try {
      await apiRequest("/hospitality/floor-tables", {
        method: "POST",
        body: {
          outlet_id: Number(selectedOutletId),
          code: tableForm.code.trim(),
          label: tableForm.label.trim(),
          seats: Number(tableForm.seats) || 4,
          zone: tableForm.zone || null,
        },
      });
      notifySuccess("Table created");
      setTableForm({ code: "", label: "", seats: "4", zone: "" });
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Table save failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleTable(table) {
    try {
      await apiRequest(`/hospitality/floor-tables/${table.id}`, {
        method: "PATCH",
        body: { is_active: !table.is_active },
      });
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Update failed");
    }
  }

  return (
    <CatalogPageShell
      title="Outlets"
      subtitle={
        extraEnabled
          ? "Main outlet plus extra outlets. Floor tables appear when enabled."
          : "Default Main outlet for Hotel & Bar POS."
      }
      action={
        extraEnabled ? (
          <PrimaryButton
            showIcon
            onClick={() => {
              setEditingId(null);
              setForm({ code: "", name: "", outlet_type: "bar", is_active: true });
              setDrawerOpen(true);
            }}
          >
            Add outlet
          </PrimaryButton>
        ) : null
      }
    >
      {loading ? (
        <p className="theme-subtext text-sm">Loading…</p>
      ) : (
        <>
          <div className={TABLE_SHELL_CLASS}>
            <table className="min-w-full text-sm">
              <thead>
                <tr className={TABLE_HEAD_ROW_CLASS}>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {outlets.map((o) => (
                  <tr key={o.id} className={TABLE_BODY_ROW_CLASS}>
                    <td className="px-3 py-2 font-medium">{o.code}</td>
                    <td className="px-3 py-2">{o.name}</td>
                    <td className="px-3 py-2 capitalize">{o.outlet_type}</td>
                    <td className="px-3 py-2">{o.is_active ? "Active" : "Inactive"}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-xs font-semibold underline"
                        onClick={() => {
                          setEditingId(o.id);
                          setForm({
                            code: o.code || "",
                            name: o.name || "",
                            outlet_type: o.outlet_type || "bar",
                            is_active: o.is_active !== false,
                          });
                          setDrawerOpen(true);
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {tablesEnabled ? (
            <section className="mt-8 space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <h2 className="theme-heading text-base font-semibold">Floor tables</h2>
                <SearchableSelect
                  className={inputClassName()}
                  value={selectedOutletId}
                  onChange={setSelectedOutletId}
                  options={outlets.map((o) => ({
                    value: String(o.id),
                    label: o.name,
                  }))}
                />
                <SecondaryButton onClick={() => void load()}>Refresh tables</SecondaryButton>
              </div>
              <form
                className="grid gap-2 rounded-xl border border-[var(--theme-border)] p-3 sm:grid-cols-5"
                onSubmit={saveTable}
              >
                <Field label="Code">
                  <input
                    required
                    className={inputClassName()}
                    value={tableForm.code}
                    onChange={(e) => setTableForm((f) => ({ ...f, code: e.target.value }))}
                  />
                </Field>
                <Field label="Label">
                  <input
                    required
                    className={inputClassName()}
                    value={tableForm.label}
                    onChange={(e) => setTableForm((f) => ({ ...f, label: e.target.value }))}
                  />
                </Field>
                <Field label="Seats">
                  <input
                    type="number"
                    min="1"
                    className={inputClassName()}
                    value={tableForm.seats}
                    onChange={(e) => setTableForm((f) => ({ ...f, seats: e.target.value }))}
                  />
                </Field>
                <Field label="Zone">
                  <input
                    className={inputClassName()}
                    value={tableForm.zone}
                    onChange={(e) => setTableForm((f) => ({ ...f, zone: e.target.value }))}
                  />
                </Field>
                <div className="flex items-end">
                  <PrimaryButton showIcon={false} type="submit" disabled={saving}>
                    Add table
                  </PrimaryButton>
                </div>
              </form>
              <div className={TABLE_SHELL_CLASS}>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className={TABLE_HEAD_ROW_CLASS}>
                      <th className="px-3 py-2 text-left">Code</th>
                      <th className="px-3 py-2 text-left">Label</th>
                      <th className="px-3 py-2 text-left">Seats</th>
                      <th className="px-3 py-2 text-left">Zone</th>
                      <th className="px-3 py-2 text-left">Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tables.map((t) => (
                      <tr key={t.id} className={TABLE_BODY_ROW_CLASS}>
                        <td className="px-3 py-2">{t.code}</td>
                        <td className="px-3 py-2">{t.label}</td>
                        <td className="px-3 py-2">{t.seats}</td>
                        <td className="px-3 py-2">{t.zone || "—"}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            className="text-xs font-semibold underline"
                            onClick={() => void toggleTable(t)}
                          >
                            {t.is_active ? "Deactivate" : "Activate"}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!tables.length ? (
                      <tr>
                        <td colSpan={5} className="theme-subtext px-3 py-6 text-center">
                          No tables for this outlet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <p className="theme-subtext mt-4 text-sm">
              Floor tables are off. Ask platform admin to enable Floor tables / Table POS.
            </p>
          )}
        </>
      )}

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editingId ? "Edit outlet" : "Add outlet"}
      >
        <form className="space-y-3" onSubmit={saveOutlet}>
          {!editingId || form.code !== "MAIN" ? (
            <Field label="Code">
              <input
                required={!editingId}
                disabled={editingId && form.code === "MAIN"}
                className={inputClassName()}
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
            </Field>
          ) : null}
          <Field label="Name">
            <input
              required
              className={inputClassName()}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <Field label="Type">
            <SearchableSelect
              className={inputClassName()}
              value={form.outlet_type}
              onChange={(v) => setForm((f) => ({ ...f, outlet_type: v }))}
              options={[
                { value: "bar", label: "Bar" },
                { value: "restaurant", label: "Restaurant" },
                { value: "other", label: "Other" },
              ]}
            />
          </Field>
          {editingId ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              Active
            </label>
          ) : null}
          <PrimaryButton showIcon={false} type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </PrimaryButton>
        </form>
      </FormDrawer>
    </CatalogPageShell>
  );
}
