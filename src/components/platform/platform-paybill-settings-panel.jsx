"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { PrimaryButton } from "@/components/catalog/catalog-shared";
import { notifyError, notifySuccess } from "@/lib/notify";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]";

export function PlatformPaybillSettingsPanel() {
  const [form, setForm] = useState({
    short_code: "",
    account_name_prefix: "",
    duration_discount_percent: "0",
    duration_discount_min_months: "3",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await apiRequest("/admin/platform-paybill");
      setForm({
        short_code: settings.data?.short_code ?? "",
        account_name_prefix: settings.data?.account_name_prefix ?? "",
        duration_discount_percent: String(settings.data?.duration_discount_percent ?? 0),
        duration_discount_min_months: String(settings.data?.duration_discount_min_months ?? 3),
      });
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not load Centrix Paybill.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest("/admin/platform-paybill", {
        method: "PUT",
        body: {
          short_code: form.short_code.trim(),
          account_name_prefix: form.account_name_prefix.trim(),
          duration_discount_percent: Number(form.duration_discount_percent) || 0,
          duration_discount_min_months: Number(form.duration_discount_min_months) || 3,
        },
      });
      notifySuccess("Centrix Paybill saved.");
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save Centrix Paybill.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={(e) => void save(e)} className="max-w-xl space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-600">
          This Paybill is only for Centrix licences. Shop paybills still match customer sales. The account number is the organisation code, for example MOON, or the organisation admin phone.
        </p>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Paybill number</span>
          <input
            className={inputClass}
            value={form.short_code}
            onChange={(e) => setForm((f) => ({ ...f, short_code: e.target.value }))}
            placeholder="4036507"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Account name prefix (optional)</span>
          <input
            className={inputClass}
            value={form.account_name_prefix}
            onChange={(e) => setForm((f) => ({ ...f, account_name_prefix: e.target.value }))}
            placeholder="CENTRIX"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Discount when paying extra months (%)</span>
            <input
              className={inputClass}
              inputMode="decimal"
              value={form.duration_discount_percent}
              onChange={(e) => setForm((f) => ({ ...f, duration_discount_percent: e.target.value }))}
              placeholder="10"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Discount starts after this many months</span>
            <input
              className={inputClass}
              inputMode="numeric"
              value={form.duration_discount_min_months}
              onChange={(e) => setForm((f) => ({ ...f, duration_discount_min_months: e.target.value }))}
              placeholder="3"
            />
          </label>
        </div>
        <p className="text-xs text-slate-500">
          A monthly plan can be paid for several months. The percentage applies only when the organisation pays for more months than the number above.
        </p>
        <PrimaryButton type="submit" showIcon={false} disabled={saving || loading}>
          {saving ? "Saving…" : "Save Paybill"}
        </PrimaryButton>
        <p className="text-sm text-slate-600">
          Received payments are listed on{" "}
          <Link href="/platform/licence-payments" className="font-medium text-[#185FA5] hover:underline">
            Licence payments
          </Link>
          .
        </p>
      </form>
    </div>
  );
}
