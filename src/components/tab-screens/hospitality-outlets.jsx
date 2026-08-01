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
  SECONDARY_BTN_CLASS,
  TABLE_BODY_ROW_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_SHELL_CLASS,
} from "@/components/catalog/catalog-shared";

export function HospitalityOutletsScreen() {
  const { capabilities } = useAuth();
  const extraEnabled = isHospitalityServiceEnabled(capabilities, "extra_outlets");
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", outlet_type: "bar" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const res = await apiRequest("/hospitality/outlets");
      setOutlets(res?.data ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load outlets");
    } finally {
      setLoading(false);
    }
  }, []);

  useTabAwareDataLoad(loadData);

  async function saveOutlet(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await apiRequest("/hospitality/outlets", {
        method: "POST",
        body: {
          code: form.code.trim(),
          name: form.name.trim(),
          outlet_type: form.outlet_type,
        },
      });
      notifySuccess("Outlet created");
      setDrawerOpen(false);
      await loadData();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CatalogPageShell
      title="Outlets"
      subtitle={
        extraEnabled
          ? "Main outlet is always present. Extra outlets are enabled for this organization."
          : "Default Main outlet for Hotel & Bar POS. Ask platform admin to enable Extra outlets for more."
      }
      actions={
        extraEnabled ? (
          <PrimaryButton
            onClick={() => {
              setForm({ code: "", name: "", outlet_type: "bar" });
              setFormError(null);
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
        <div className={TABLE_SHELL_CLASS}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className={TABLE_HEAD_ROW_CLASS}>
                <th className="px-3 py-2 text-left">Code</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {outlets.map((row) => (
                <tr key={row.id} className={TABLE_BODY_ROW_CLASS}>
                  <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
                  <td className="px-3 py-2 font-medium">{row.name}</td>
                  <td className="px-3 py-2 capitalize">{row.outlet_type}</td>
                  <td className="px-3 py-2">{row.is_active === false ? "Inactive" : "Active"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!extraEnabled ? (
        <p className="theme-subtext mt-4 rounded-xl border border-dashed border-[var(--theme-border)] px-4 py-3 text-sm">
          Floor tables, table POS, and additional bars/restaurants stay off until enabled under Platform →
          Organization → Applications → Hotel &amp; Bar POS services.
        </p>
      ) : null}

      <FormDrawer open={drawerOpen} title="Add outlet" onClose={() => setDrawerOpen(false)} error={formError}>
        <form className="space-y-3" onSubmit={(e) => void saveOutlet(e)}>
          <Field label="Code">
            <input
              className={inputClassName}
              value={form.code}
              onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
              required
            />
          </Field>
          <Field label="Name">
            <input
              className={inputClassName}
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
          </Field>
          <Field label="Type">
            <select
              className={inputClassName}
              value={form.outlet_type}
              onChange={(e) => setForm((p) => ({ ...p, outlet_type: e.target.value }))}
            >
              <option value="bar">Bar</option>
              <option value="restaurant">Restaurant</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <div className="flex gap-2">
            <button type="button" className={SECONDARY_BTN_CLASS} onClick={() => setDrawerOpen(false)}>
              Cancel
            </button>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </PrimaryButton>
          </div>
        </form>
      </FormDrawer>
    </CatalogPageShell>
  );
}
