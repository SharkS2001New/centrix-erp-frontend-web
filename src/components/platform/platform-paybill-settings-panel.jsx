"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Eye, EyeOff, X } from "lucide-react";
import { apiBaseOrigin, apiRequest, ApiError } from "@/lib/api";
import { PrimaryButton } from "@/components/catalog/catalog-shared";
import { notifyError, notifySuccess } from "@/lib/notify";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]";

function platformC2bCallbackUrls() {
  const apiOrigin = apiBaseOrigin().replace(/\/+$/, "");

  return {
    confirmation: `${apiOrigin}/api/v1/payments/c2b/confirmation`,
    validation: `${apiOrigin}/api/v1/payments/c2b/validation`,
  };
}

export function PlatformPaybillSettingsPanel() {
  const [form, setForm] = useState({
    short_code: "",
    account_name_prefix: "",
    manual_mpesa_account_name: "",
    manual_mpesa_instructions: "",
    equity_manual_paybill: "",
    equity_manual_account_name: "",
    equity_manual_account_number: "",
    equity_manual_instructions: "",
    stk_env: "sandbox",
    stk_consumer_key: "",
    stk_consumer_secret: "",
    stk_shortcode: "",
    stk_passkey: "",
    stk_callback_url: "",
    c2b_confirmation_url: "",
    c2b_validation_url: "",
    duration_discount_percent: "0",
    duration_discount_min_months: "3",
  });
  const [savedStkCredentials, setSavedStkCredentials] = useState({
    consumerKey: false,
    consumerSecret: false,
    passkey: false,
  });
  const [clearStkCredentials, setClearStkCredentials] = useState(false);
  const [visibleCredentials, setVisibleCredentials] = useState({
    consumerKey: false,
    consumerSecret: false,
    passkey: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [registeringC2b, setRegisteringC2b] = useState(false);
  const [c2bModalOpen, setC2bModalOpen] = useState(false);

  const applySettings = useCallback((settings) => {
    const callbackUrls = platformC2bCallbackUrls();
    setForm({
      short_code: settings.data?.short_code ?? "",
      account_name_prefix: settings.data?.account_name_prefix ?? "",
      manual_mpesa_account_name: settings.data?.manual_mpesa_account_name ?? "",
      manual_mpesa_instructions: settings.data?.manual_mpesa_instructions ?? "",
      equity_manual_paybill: settings.data?.equity_manual_paybill ?? "",
      equity_manual_account_name: settings.data?.equity_manual_account_name ?? "",
      equity_manual_account_number: settings.data?.equity_manual_account_number ?? "",
      equity_manual_instructions: settings.data?.equity_manual_instructions ?? "",
      stk_env: settings.data?.stk_env === "live" ? "live" : "sandbox",
      stk_consumer_key: "",
      stk_consumer_secret: "",
      stk_shortcode: settings.data?.stk_shortcode ?? "",
      stk_passkey: "",
      stk_callback_url: settings.data?.stk_callback_url ?? "",
      c2b_confirmation_url: callbackUrls.confirmation,
      c2b_validation_url: callbackUrls.validation,
      duration_discount_percent: String(settings.data?.duration_discount_percent ?? 0),
      duration_discount_min_months: String(settings.data?.duration_discount_min_months ?? 3),
    });
    setSavedStkCredentials({
      consumerKey: Boolean(settings.data?.has_stk_consumer_key),
      consumerSecret: Boolean(settings.data?.has_stk_consumer_secret),
      passkey: Boolean(settings.data?.has_stk_passkey),
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await apiRequest("/admin/platform-paybill");
      applySettings(settings);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not load subscription payment settings.");
    } finally {
      setLoading(false);
    }
  }, [applySettings]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSettings() {
    setSaving(true);
    try {
      const settings = await apiRequest("/admin/platform-paybill", {
        method: "PUT",
        body: {
          short_code: form.short_code.trim(),
          account_name_prefix: form.account_name_prefix.trim(),
          manual_mpesa_account_name: form.manual_mpesa_account_name.trim(),
          manual_mpesa_instructions: form.manual_mpesa_instructions.trim(),
          equity_manual_paybill: form.equity_manual_paybill.trim(),
          equity_manual_account_name: form.equity_manual_account_name.trim(),
          equity_manual_account_number: form.equity_manual_account_number.trim(),
          equity_manual_instructions: form.equity_manual_instructions.trim(),
          stk_env: form.stk_env,
          stk_consumer_key: form.stk_consumer_key,
          stk_consumer_secret: form.stk_consumer_secret,
          stk_shortcode: form.stk_shortcode.trim(),
          stk_passkey: form.stk_passkey,
          stk_callback_url: form.stk_callback_url.trim(),
          c2b_confirmation_url: form.c2b_confirmation_url.trim(),
          c2b_validation_url: form.c2b_validation_url.trim(),
          clear_stk_credentials: clearStkCredentials,
          duration_discount_percent: Number(form.duration_discount_percent) || 0,
          duration_discount_min_months: Number(form.duration_discount_min_months) || 3,
        },
      });
      applySettings(settings);
      setClearStkCredentials(false);
      notifySuccess("Subscription payment settings saved.");
      return true;
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save subscription payment settings.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    await saveSettings();
  }

  async function saveAndRegisterC2bUrls() {
    setRegisteringC2b(true);
    try {
      if (!await saveSettings()) return;
      const result = await apiRequest("/admin/platform-paybill/register-c2b-urls", {
        method: "POST",
        loading: false,
        reportIssues: false,
      });
      notifySuccess(result.message || "Platform C2B URLs registered successfully with Daraja.");
      setC2bModalOpen(false);
    } catch (err) {
      const message = err instanceof ApiError && err.status === 0
        ? "The connection closed before the registration result was received. Your settings were saved, but Daraja may have received the request. Check the Daraja portal before trying again; Safaricom allows live URL registration only once."
        : err instanceof ApiError
          ? err.message
          : "Could not register platform C2B URLs with Daraja.";
      notifyError(message);
    } finally {
      setRegisteringC2b(false);
    }
  }

  async function copyC2bUrl(url, label) {
    try {
      await navigator.clipboard.writeText(url);
      notifySuccess(`${label} URL copied.`);
    } catch {
      notifyError("Could not copy the URL. Select it and copy it manually.");
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={(e) => void save(e)} className="theme-panel space-y-6 rounded-2xl border p-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Subscription payment methods</h2>
          <p className="mt-1 text-sm text-slate-600">
            Configure manual M-Pesa and Equity payment instructions and Daraja STK credentials. Credentials are encrypted at rest and never returned by the API.
          </p>
        </div>
        <p className="text-sm text-slate-600">
          This Paybill is only for Centrix licences. Shop paybills still match customer sales. The account number is the organisation code, for example MOON, or the organisation admin phone.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Manual M-Pesa Paybill / Till</span>
            <input
              className={inputClass}
              value={form.short_code}
              onChange={(e) => setForm((f) => ({ ...f, short_code: e.target.value }))}
              placeholder="Paybill or till number"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Account name shown to customers</span>
            <input
              className={inputClass}
              value={form.manual_mpesa_account_name}
              onChange={(e) => setForm((f) => ({ ...f, manual_mpesa_account_name: e.target.value }))}
              placeholder="CentrixERP"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Account reference prefix (optional)</span>
            <input
              className={inputClass}
              value={form.account_name_prefix}
              onChange={(e) => setForm((f) => ({ ...f, account_name_prefix: e.target.value }))}
              placeholder="For example, CENTRIX"
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block text-xs font-medium text-slate-600">Manual M-Pesa instructions</span>
            <textarea
              className={`${inputClass} min-h-20`}
              value={form.manual_mpesa_instructions}
              onChange={(e) => setForm((f) => ({ ...f, manual_mpesa_instructions: e.target.value }))}
              placeholder="Use the organisation code as the account/reference. Transfer the exact amount shown."
            />
          </label>
        </div>

        <div className="border-t border-slate-200 pt-5">
          <h3 className="text-sm font-semibold text-slate-900">Manual Equity transfer</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            These details are shown to organisations choosing Equity. Their payment reference is sent to platform administrators for manual verification before activation.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Equity Paybill / Till</span>
              <input
                className={inputClass}
                value={form.equity_manual_paybill}
                onChange={(e) => setForm((f) => ({ ...f, equity_manual_paybill: e.target.value }))}
                placeholder="Equity Paybill or Till number"
                autoComplete="off"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Account name</span>
              <input
                className={inputClass}
                value={form.equity_manual_account_name}
                onChange={(e) => setForm((f) => ({ ...f, equity_manual_account_name: e.target.value }))}
                placeholder="CentrixERP"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Account number (optional)</span>
              <input
                className={inputClass}
                value={form.equity_manual_account_number}
                onChange={(e) => setForm((f) => ({ ...f, equity_manual_account_number: e.target.value }))}
                placeholder="Leave blank to use the organisation code"
                autoComplete="off"
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block text-xs font-medium text-slate-600">Equity payment instructions</span>
              <textarea
                className={`${inputClass} min-h-20`}
                value={form.equity_manual_instructions}
                onChange={(e) => setForm((f) => ({ ...f, equity_manual_instructions: e.target.value }))}
                placeholder="Transfer the exact amount and use your organisation code as the reference."
              />
            </label>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-5">
          <h3 className="text-sm font-semibold text-slate-900">M-Pesa STK Push (Daraja)</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            STK is offered only when all required fields are valid. The callback URL is sent with each STK request.
          </p>
          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-700">STK callback URL</span>
              <input
                className={inputClass}
                type="url"
                value={form.stk_callback_url}
                onChange={(e) => setForm((f) => ({ ...f, stk_callback_url: e.target.value }))}
                placeholder="https://api.example.com/api/v1/payments/stk/callback"
                autoComplete="url"
              />
            </label>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Daraja receives this URL in every STK Push request; it is not registered through Daraja&apos;s C2B Register URL API.
            </p>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Environment</span>
              <select
                className={inputClass}
                value={form.stk_env}
                onChange={(e) => setForm((f) => ({ ...f, stk_env: e.target.value }))}
              >
                <option value="sandbox">Sandbox</option>
                <option value="live">Live</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">STK shortcode</span>
              <input
                className={inputClass}
                value={form.stk_shortcode}
                onChange={(e) => setForm((f) => ({ ...f, stk_shortcode: e.target.value }))}
                placeholder="Daraja shortcode"
                autoComplete="off"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Consumer key</span>
              <div className="relative">
                <input
                  className={`${inputClass} pr-10`}
                  type={visibleCredentials.consumerKey ? "text" : "password"}
                  value={form.stk_consumer_key}
                  onChange={(e) => {
                    setClearStkCredentials(false);
                    setForm((f) => ({ ...f, stk_consumer_key: e.target.value }));
                  }}
                  placeholder={savedStkCredentials.consumerKey ? "Saved — enter a new key to replace" : "Daraja consumer key"}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800"
                  aria-label={visibleCredentials.consumerKey ? "Hide consumer key" : "Show consumer key"}
                  onClick={() => setVisibleCredentials((current) => ({ ...current, consumerKey: !current.consumerKey }))}
                >
                  {visibleCredentials.consumerKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {savedStkCredentials.consumerKey ? <span className="mt-1 block text-xs text-emerald-700">A key is saved.</span> : null}
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Consumer secret</span>
              <div className="relative">
                <input
                  className={`${inputClass} pr-10`}
                  type={visibleCredentials.consumerSecret ? "text" : "password"}
                  value={form.stk_consumer_secret}
                  onChange={(e) => {
                    setClearStkCredentials(false);
                    setForm((f) => ({ ...f, stk_consumer_secret: e.target.value }));
                  }}
                  placeholder={savedStkCredentials.consumerSecret ? "Saved — enter a new secret to replace" : "Daraja consumer secret"}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800"
                  aria-label={visibleCredentials.consumerSecret ? "Hide consumer secret" : "Show consumer secret"}
                  onClick={() => setVisibleCredentials((current) => ({ ...current, consumerSecret: !current.consumerSecret }))}
                >
                  {visibleCredentials.consumerSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {savedStkCredentials.consumerSecret ? <span className="mt-1 block text-xs text-emerald-700">A secret is saved.</span> : null}
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Passkey</span>
              <div className="relative">
                <input
                  className={`${inputClass} pr-10`}
                  type={visibleCredentials.passkey ? "text" : "password"}
                  value={form.stk_passkey}
                  onChange={(e) => {
                    setClearStkCredentials(false);
                    setForm((f) => ({ ...f, stk_passkey: e.target.value }));
                  }}
                  placeholder={savedStkCredentials.passkey ? "Saved — enter a new passkey to replace" : "Daraja STK passkey"}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800"
                  aria-label={visibleCredentials.passkey ? "Hide passkey" : "Show passkey"}
                  onClick={() => setVisibleCredentials((current) => ({ ...current, passkey: !current.passkey }))}
                >
                  {visibleCredentials.passkey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {savedStkCredentials.passkey ? <span className="mt-1 block text-xs text-emerald-700">A passkey is saved.</span> : null}
            </label>
            <div className="border-t border-slate-200 pt-3 md:col-span-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Daraja C2B callback registration</h4>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Use the shared Centrix API callbacks for the platform paybill. Payments are matched to organisations using the account reference.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <PrimaryButton
              type="button"
              showIcon={false}
              disabled={loading}
              onClick={() => setC2bModalOpen(true)}
            >
              View and register platform C2B URLs
            </PrimaryButton>
            <span className="text-xs text-slate-500">
              View/copy the fixed API callback URLs, or save and register them with Daraja.
            </span>
          </div>
          {(savedStkCredentials.consumerKey || savedStkCredentials.consumerSecret || savedStkCredentials.passkey) ? (
            <label className="mt-4 flex items-center gap-2 text-sm text-red-700">
              <input
                type="checkbox"
                checked={clearStkCredentials}
                onChange={(e) => setClearStkCredentials(e.target.checked)}
              />
              Clear saved STK credentials and disable STK
            </label>
          ) : null}
        </div>

        <div className="border-t border-slate-200 pt-5">
          <h3 className="text-sm font-semibold text-slate-900">Multi-month discount</h3>
          <p className="mt-1 text-xs text-slate-500">
            The percentage applies when an organisation pays for more months than the threshold.
          </p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
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
        </div>

        <p className="text-sm text-slate-600">
          Received payments are listed on{" "}
          <Link href="/platform/licence-payments" className="font-medium text-[#185FA5] hover:underline">
            Licence payments
          </Link>
          .
        </p>
        <p className="text-xs text-slate-500">
          If manual Equity Paybill / Till is blank, Equity uses an active platform Equity account configured under platform organization payment accounts.
        </p>
        <PrimaryButton type="submit" showIcon={false} disabled={saving || loading}>
          {saving ? "Saving…" : "Save payment settings"}
        </PrimaryButton>
      </form>

      {c2bModalOpen ? (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !registeringC2b) setC2bModalOpen(false);
          }}
        >
          <div
            className="theme-panel max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="platform-c2b-modal-title"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="platform-c2b-modal-title" className="text-base font-semibold text-slate-900">
                  Platform C2B callback URLs
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  These are the shared backend endpoints Safaricom calls after a platform Paybill payment. They are not website pages or per-organisation URLs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setC2bModalOpen(false)}
                disabled={registeringC2b}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                aria-label="Close callback URL dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {[
                ["Confirmation URL", form.c2b_confirmation_url],
                ["Validation URL", form.c2b_validation_url],
              ].map(([label, url]) => (
                <label key={label} className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
                  <div className="flex gap-2">
                    <input className={inputClass} value={url} readOnly onFocus={(event) => event.target.select()} />
                    <PrimaryButton
                      type="button"
                      showIcon={false}
                      onClick={() => void copyC2bUrl(url, label.replace(" URL", ""))}
                    >
                      <Copy className="mr-1 inline h-4 w-4" />
                      Copy
                    </PrimaryButton>
                  </div>
                </label>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-4">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                onClick={() => setC2bModalOpen(false)}
                disabled={registeringC2b}
              >
                Close
              </button>
              <PrimaryButton
                type="button"
                showIcon={false}
                disabled={saving || loading || registeringC2b}
                onClick={() => void saveAndRegisterC2bUrls()}
              >
                {registeringC2b ? "Saving & registering…" : "Save & register with Daraja"}
              </PrimaryButton>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              This saves the current payment settings first, then registers the confirmation and validation URLs for the platform shortcode with Daraja. It does not change the separate STK callback.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
