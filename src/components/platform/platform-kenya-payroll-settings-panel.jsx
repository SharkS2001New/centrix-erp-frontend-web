"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  PrimaryButton,
  SECONDARY_BTN_CLASS,
} from "@/components/catalog/catalog-shared";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]";

function emptyBand() {
  return { up_to: "", rate_percent: "" };
}

function bandsToForm(bands) {
  if (!Array.isArray(bands) || bands.length === 0) {
    return [emptyBand()];
  }
  return bands.map((b, i) => ({
    up_to: b.up_to == null || i === bands.length - 1 ? "" : String(b.up_to),
    rate_percent: b.rate != null ? String(Math.round(Number(b.rate) * 10000) / 100) : "",
  }));
}

function formBandsToPayload(rows) {
  return rows.map((row, i) => {
    const isLast = i === rows.length - 1;
    const rate = Number(row.rate_percent);
    return {
      up_to: isLast || row.up_to === "" ? null : Number(row.up_to),
      rate: Number.isFinite(rate) ? rate / 100 : 0,
    };
  });
}

export function PlatformKenyaPayrollSettingsPanel() {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [effective, setEffective] = useState(null);
  const [form, setForm] = useState({
    effective_label: "2026-02",
    personal_relief_monthly: "2400",
    insurance_relief_rate_percent: "15",
    insurance_relief_cap_monthly: "5000",
    bands: [emptyBand()],
    nssf_rate_percent: "6",
    nssf_tier1_upper: "9000",
    nssf_tier2_upper: "108000",
    shif_rate_percent: "2.75",
    shif_minimum_monthly: "300",
    housing_employee_rate_percent: "1.5",
    housing_employer_rate_percent: "1.5",
  });

  const applyPayload = useCallback((res) => {
    const settings = res.settings ?? {};
    const paye = settings.paye ?? {};
    const nssf = settings.nssf ?? {};
    const shif = settings.shif ?? {};
    const hl = settings.housing_levy ?? {};
    setEffective(res.effective ?? null);
    setForm({
      effective_label: settings.effective_label ?? "2026-02",
      personal_relief_monthly: String(paye.personal_relief_monthly ?? 2400),
      insurance_relief_rate_percent: String(
        Math.round(Number(paye.insurance_relief_rate ?? 0.15) * 10000) / 100,
      ),
      insurance_relief_cap_monthly: String(paye.insurance_relief_cap_monthly ?? 5000),
      bands: bandsToForm(paye.bands),
      nssf_rate_percent: String(Math.round(Number(nssf.rate ?? 0.06) * 10000) / 100),
      nssf_tier1_upper: String(nssf.tier1_upper ?? 9000),
      nssf_tier2_upper: String(nssf.tier2_upper ?? 108000),
      shif_rate_percent: String(Math.round(Number(shif.rate ?? 0.0275) * 10000) / 100),
      shif_minimum_monthly: String(shif.minimum_monthly ?? 300),
      housing_employee_rate_percent: String(
        Math.round(Number(hl.employee_rate ?? 0.015) * 10000) / 100,
      ),
      housing_employer_rate_percent: String(
        Math.round(Number(hl.employer_rate ?? 0.015) * 10000) / 100,
      ),
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/kenya-payroll-settings");
      applyPayload(res);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load Kenya payroll settings.");
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    void load();
  }, [load]);

  const approxTaxFree = useMemo(() => {
    const relief = Number(form.personal_relief_monthly);
    const firstRate = Number(form.bands[0]?.rate_percent);
    if (!Number.isFinite(relief) || !Number.isFinite(firstRate) || firstRate <= 0) return null;
    return Math.round((relief / (firstRate / 100)) * 100) / 100;
  }, [form.personal_relief_monthly, form.bands]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiRequest("/admin/kenya-payroll-settings", {
        method: "PUT",
        body: {
          effective_label: form.effective_label.trim() || null,
          paye: {
            personal_relief_monthly: Number(form.personal_relief_monthly),
            insurance_relief_rate: Number(form.insurance_relief_rate_percent) / 100,
            insurance_relief_cap_monthly: Number(form.insurance_relief_cap_monthly),
            bands: formBandsToPayload(form.bands),
          },
          nssf: {
            rate: Number(form.nssf_rate_percent) / 100,
            tier1_upper: Number(form.nssf_tier1_upper),
            tier2_upper: Number(form.nssf_tier2_upper),
          },
          shif: {
            rate: Number(form.shif_rate_percent) / 100,
            minimum_monthly: Number(form.shif_minimum_monthly),
          },
          housing_levy: {
            employee_rate: Number(form.housing_employee_rate_percent) / 100,
            employer_rate: Number(form.housing_employer_rate_percent) / 100,
          },
        },
      });
      applyPayload(res);
      notifySuccess("Kenya payroll rates saved. New payroll runs use these values.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    const ok = await confirm({
      title: "Reset to defaults",
      message:
        "Clear platform overrides and restore the built-in Kenya rates from the API defaults (current KRA structure)?",
      confirmLabel: "Reset to defaults",
      destructive: true,
    });
    if (!ok) return;
    setSaving(true);
    try {
      const res = await apiRequest("/admin/kenya-payroll-settings", {
        method: "PUT",
        body: { reset_to_defaults: true },
      });
      applyPayload(res);
      notifySuccess("Kenya payroll rates reset to defaults.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not reset settings.");
    } finally {
      setSaving(false);
    }
  }

  function updateBand(index, patch) {
    setForm((f) => ({
      ...f,
      bands: f.bands.map((b, i) => (i === index ? { ...b, ...patch } : b)),
    }));
  }

  function addBand() {
    setForm((f) => {
      const bands = [...f.bands];
      const last = bands[bands.length - 1] ?? emptyBand();
      bands[bands.length - 1] = {
        up_to: last.up_to || "",
        rate_percent: last.rate_percent || "",
      };
      bands.push({ up_to: "", rate_percent: last.rate_percent || "35" });
      return { ...f, bands };
    });
  }

  function removeBand(index) {
    setForm((f) => {
      if (f.bands.length <= 1) return f;
      const bands = f.bands.filter((_, i) => i !== index);
      return { ...f, bands };
    });
  }

  return (
    <section className="theme-panel rounded-xl border p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Kenya payroll (PAYE &amp; statutory)</h2>
          <p className="mt-1 max-w-2xl text-xs text-slate-500">
            Platform-wide KRA rates used when payroll calculates PAYE, NSSF, SHIF, and housing levy.
            Defaults match current Kenya law; change them here when the government updates bands or
            reliefs. Existing processed runs keep old amounts until reprocessed.
          </p>
        </div>
        <button type="button" className={SECONDARY_BTN_CLASS} disabled={loading} onClick={() => void load()}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {effective ? (
        <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Effective label: <span className="font-medium text-slate-800">{effective.effective_label}</span>
          {" · "}
          Personal relief:{" "}
          <span className="font-medium text-slate-800">
            KES {Number(effective.personal_relief_monthly).toLocaleString("en-KE")}
          </span>
          {" · "}
          Approx. tax-free taxable income:{" "}
          <span className="font-medium text-slate-800">
            KES {Number(effective.approx_tax_free_taxable_income).toLocaleString("en-KE")}
          </span>
        </p>
      ) : null}

      <form onSubmit={(e) => void handleSave(e)} className="mt-4 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Effective label</span>
            <input
              className={inputClass}
              value={form.effective_label}
              onChange={(e) => setForm((f) => ({ ...f, effective_label: e.target.value }))}
              disabled={loading || saving}
              placeholder="2026-02"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Personal relief (KES / month)
            </span>
            <input
              type="number"
              min="0"
              step="1"
              className={inputClass}
              value={form.personal_relief_monthly}
              onChange={(e) => setForm((f) => ({ ...f, personal_relief_monthly: e.target.value }))}
              disabled={loading || saving}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Approx. deductible taxable range (computed)
            </span>
            <input
              className={inputClass}
              value={
                approxTaxFree != null
                  ? `≈ KES ${approxTaxFree.toLocaleString("en-KE")} taxable (relief ÷ 1st band %)`
                  : "—"
              }
              readOnly
              disabled
            />
          </label>
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">PAYE bands</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Taxable income bands. Leave the last row&apos;s &quot;Up to&quot; blank for open-ended.
                First band upper limit is the main deductible range (usually 24,000).
              </p>
            </div>
            <button
              type="button"
              className={SECONDARY_BTN_CLASS}
              disabled={loading || saving}
              onClick={addBand}
            >
              Add band
            </button>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="pb-2 pr-2 font-medium">Up to (KES taxable)</th>
                  <th className="pb-2 pr-2 font-medium">Rate %</th>
                  <th className="pb-2 w-20" />
                </tr>
              </thead>
              <tbody>
                {form.bands.map((band, index) => {
                  const isLast = index === form.bands.length - 1;
                  return (
                    <tr key={index}>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className={inputClass}
                          value={isLast ? "" : band.up_to}
                          placeholder={isLast ? "Above previous (open)" : "24000"}
                          disabled={loading || saving || isLast}
                          onChange={(e) => updateBand(index, { up_to: e.target.value })}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          className={inputClass}
                          value={band.rate_percent}
                          disabled={loading || saving}
                          onChange={(e) => updateBand(index, { rate_percent: e.target.value })}
                        />
                      </td>
                      <td className="py-1.5">
                        {!isLast && form.bands.length > 1 ? (
                          <button
                            type="button"
                            className="text-xs font-medium text-red-600 hover:underline"
                            disabled={loading || saving}
                            onClick={() => removeBand(index)}
                          >
                            Remove
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Insurance relief rate %
            </span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className={inputClass}
              value={form.insurance_relief_rate_percent}
              onChange={(e) =>
                setForm((f) => ({ ...f, insurance_relief_rate_percent: e.target.value }))
              }
              disabled={loading || saving}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Insurance relief cap (KES / month)
            </span>
            <input
              type="number"
              min="0"
              step="1"
              className={inputClass}
              value={form.insurance_relief_cap_monthly}
              onChange={(e) =>
                setForm((f) => ({ ...f, insurance_relief_cap_monthly: e.target.value }))
              }
              disabled={loading || saving}
            />
          </label>
        </div>

        <div className="grid gap-4 rounded-lg border border-slate-200 p-3 sm:grid-cols-3">
          <p className="sm:col-span-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            NSSF / SHIF / Housing levy
          </p>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">NSSF rate %</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className={inputClass}
              value={form.nssf_rate_percent}
              onChange={(e) => setForm((f) => ({ ...f, nssf_rate_percent: e.target.value }))}
              disabled={loading || saving}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">NSSF tier I upper</span>
            <input
              type="number"
              min="0"
              className={inputClass}
              value={form.nssf_tier1_upper}
              onChange={(e) => setForm((f) => ({ ...f, nssf_tier1_upper: e.target.value }))}
              disabled={loading || saving}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">NSSF tier II upper</span>
            <input
              type="number"
              min="0"
              className={inputClass}
              value={form.nssf_tier2_upper}
              onChange={(e) => setForm((f) => ({ ...f, nssf_tier2_upper: e.target.value }))}
              disabled={loading || saving}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">SHIF rate %</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className={inputClass}
              value={form.shif_rate_percent}
              onChange={(e) => setForm((f) => ({ ...f, shif_rate_percent: e.target.value }))}
              disabled={loading || saving}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">SHIF minimum (KES)</span>
            <input
              type="number"
              min="0"
              className={inputClass}
              value={form.shif_minimum_monthly}
              onChange={(e) => setForm((f) => ({ ...f, shif_minimum_monthly: e.target.value }))}
              disabled={loading || saving}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Housing employee %</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className={inputClass}
              value={form.housing_employee_rate_percent}
              onChange={(e) =>
                setForm((f) => ({ ...f, housing_employee_rate_percent: e.target.value }))
              }
              disabled={loading || saving}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Housing employer %</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className={inputClass}
              value={form.housing_employer_rate_percent}
              onChange={(e) =>
                setForm((f) => ({ ...f, housing_employer_rate_percent: e.target.value }))
              }
              disabled={loading || saving}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <PrimaryButton type="submit" disabled={loading || saving} showIcon={false}>
            {saving ? "Saving…" : "Save rates"}
          </PrimaryButton>
          <button
            type="button"
            className={SECONDARY_BTN_CLASS}
            disabled={loading || saving}
            onClick={() => void handleReset()}
          >
            Reset to defaults
          </button>
        </div>
      </form>
    </section>
  );
}
