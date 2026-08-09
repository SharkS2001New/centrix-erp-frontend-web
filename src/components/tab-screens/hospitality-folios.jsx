"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { notifyError, notifySuccess } from "@/lib/notify";
import { isHospitalityServiceEnabled } from "@/lib/hospitality-services";
import { resolveHotelPosPaymentConfig } from "@/lib/hotel-pos-settings";
import { postFolioPaymentsFromPanel } from "@/lib/hospitality-folio-payments";
import {
  CatalogPageShell,
  Field,
  FilterSelect,
  FormDrawer,
  inputClassName,
  PrimaryButton,
  SearchableSelect,
  SecondaryButton,
  TABLE_BODY_ROW_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_SHELL_CLASS,
} from "@/components/catalog/catalog-shared";
import { HospitalityPlaceholderScreen } from "@/components/hospitality/hospitality-screens";
import { HotelPosPaymentPanel } from "@/components/hospitality/hotel-pos-payment-panel";
import { printHospitalityFolioStatement } from "@/components/hospitality/hospitality-folio-statement-print";

export function HospitalityFoliosScreen() {
  const { capabilities } = useAuth();
  if (!isHospitalityServiceEnabled(capabilities, "folios")) {
    return (
      <HospitalityPlaceholderScreen title="Guest folios" description="Guest accounts." serviceKey="folios" />
    );
  }
  return <FoliosManager />;
}

function FoliosManager() {
  const { capabilities, user, organization } = useAuth();
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("open");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [charge, setCharge] = useState({ charge_type: "other", description: "", amount: "" });
  const [saving, setSaving] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  const [activePaymentMethods, setActivePaymentMethods] = useState([]);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReference, setRefundReference] = useState("");

  const paymentConfig = useMemo(
    () =>
      resolveHotelPosPaymentConfig(capabilities?.module_settings, {
        capabilities,
        activePaymentMethods,
      }),
    [capabilities, activePaymentMethods],
  );

  useEffect(() => {
    let cancelled = false;
    apiRequest("/payment-methods", {
      searchParams: { per_page: 50, "filter[is_active]": 1 },
      loading: false,
      reportIssues: false,
    })
      .then((res) => {
        if (!cancelled) setActivePaymentMethods(res?.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setActivePaymentMethods([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await apiRequest("/hospitality/folios", {
        searchParams: { status: status || undefined, per_page: 100 },
      });
      setRows(res?.data ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load folios");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useTabAwareDataLoad(load);

  async function openDetail(id) {
    try {
      const res = await apiRequest(`/hospitality/folios/${id}`);
      setDetail(res?.folio ?? null);
      setCharge({ charge_type: "other", description: "", amount: "" });
      setPaymentOpen(false);
      setPaymentError(null);
      setRefundAmount("");
      setRefundReference("");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load folio");
    }
  }

  async function postCharge(e) {
    e.preventDefault();
    if (!detail?.id) return;
    setSaving(true);
    try {
      const res = await apiRequest(`/hospitality/folios/${detail.id}/charges`, {
        method: "POST",
        body: {
          charge_type: charge.charge_type,
          description: charge.description,
          amount: Number(charge.amount),
        },
      });
      setDetail(res?.folio ?? null);
      notifySuccess("Charge posted");
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Charge failed");
    } finally {
      setSaving(false);
    }
  }

  async function handlePaymentComplete(payload) {
    if (!detail?.id) return;
    setSaving(true);
    setPaymentError(null);
    try {
      const folio = await postFolioPaymentsFromPanel(detail.id, payload);
      setDetail(folio);
      setPaymentOpen(false);
      notifySuccess("Payment recorded");
      await load();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err?.message || "Payment failed";
      setPaymentError(message);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setSaving(false);
    }
  }

  async function printStatement() {
    if (!detail) return;
    try {
      await printHospitalityFolioStatement(detail, {
        organization,
        user,
        printSettings: capabilities?.module_settings?.print ?? null,
        generalSettings: capabilities?.module_settings?.general ?? null,
      });
      notifySuccess("Statement sent to printer");
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Print failed");
    }
  }

  async function refundDeposit(e) {
    e.preventDefault();
    if (!detail?.id) return;
    const amount = Number(refundAmount);
    if (!(amount > 0)) {
      notifyError("Enter a refund amount");
      return;
    }
    setSaving(true);
    try {
      const res = await apiRequest(`/hospitality/folios/${detail.id}/payments`, {
        method: "POST",
        body: {
          method_code: "REFUND",
          amount,
          reference: refundReference.trim() || "Deposit refund",
        },
      });
      setDetail(res?.folio ?? null);
      setRefundAmount("");
      setRefundReference("");
      notifySuccess("Refund recorded");
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Refund failed");
    } finally {
      setSaving(false);
    }
  }

  const balance = Number(detail?.balance ?? 0);
  const depositPaid = (detail?.payments || [])
    .filter((p) => String(p.method_code).toUpperCase() === "DEPOSIT")
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const refunded = (detail?.payments || [])
    .filter((p) => String(p.method_code).toUpperCase() === "REFUND")
    .reduce((s, p) => s + Math.abs(Number(p.amount) || 0), 0);
  const refundableDeposit = Math.max(0, depositPaid - refunded);

  return (
    <CatalogPageShell title="Guest folios" subtitle="Charges, payments, and guest balances.">
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterSelect
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: "open", label: "Open" },
            { value: "checked_out", label: "Checked out" },
            { value: "", label: "All" },
          ]}
        />
        <SecondaryButton onClick={() => void load()}>Refresh</SecondaryButton>
      </div>
      {loading ? (
        <p className="theme-subtext text-sm">Loading…</p>
      ) : (
        <div className={TABLE_SHELL_CLASS}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className={TABLE_HEAD_ROW_CLASS}>
                <th className="px-3 py-2 text-left">Folio</th>
                <th className="px-3 py-2 text-left">Guest</th>
                <th className="px-3 py-2 text-left">Room</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={`${TABLE_BODY_ROW_CLASS} cursor-pointer`}
                  onClick={() => void openDetail(row.id)}
                >
                  <td className="px-3 py-2 font-medium">{row.folio_number}</td>
                  <td className="px-3 py-2">{row.guest_name}</td>
                  <td className="px-3 py-2">{row.room_number || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(row.balance).toFixed(2)}</td>
                  <td className="px-3 py-2 capitalize">{row.status?.replace("_", " ")}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={5} className="theme-subtext px-3 py-8 text-center">
                    No folios.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      <FormDrawer open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.folio_number || "Folio"}>
        {detail ? (
          <div className="space-y-4 text-sm">
            <p>
              <span className="font-medium">{detail.guest_name}</span>
              <span className="theme-subtext"> · Room {detail.room_number || "—"}</span>
            </p>
            <p className="text-lg font-semibold tabular-nums">Balance {balance.toFixed(2)}</p>
            <div className="flex flex-wrap gap-2">
              <SecondaryButton type="button" disabled={saving} onClick={() => void printStatement()}>
                Print statement
              </SecondaryButton>
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold uppercase">Charges</p>
              <ul className="space-y-1">
                {(detail.charges || []).map((c) => (
                  <li key={c.id} className="flex justify-between gap-2 border-b border-[var(--theme-border)] py-1">
                    <span>
                      {c.description}{" "}
                      <span className="theme-subtext text-xs">({c.charge_type})</span>
                    </span>
                    <span className="tabular-nums">{Number(c.amount).toFixed(2)}</span>
                  </li>
                ))}
                {!detail.charges?.length ? <li className="theme-subtext">No charges</li> : null}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase">Payments</p>
              <ul className="space-y-1">
                {(detail.payments || []).map((p) => (
                  <li key={p.id} className="flex justify-between gap-2 border-b border-[var(--theme-border)] py-1">
                    <span>
                      {p.method_code}
                      {p.reference ? (
                        <span className="theme-subtext text-xs"> · {p.reference}</span>
                      ) : null}
                    </span>
                    <span className="tabular-nums">{Number(p.amount).toFixed(2)}</span>
                  </li>
                ))}
                {!detail.payments?.length ? <li className="theme-subtext">No payments</li> : null}
              </ul>
            </div>

            {detail.status === "open" ? (
              <>
                {refundableDeposit > 0.009 ? (
                  <form
                    className="space-y-2 rounded-lg border border-[var(--theme-border)] p-3"
                    onSubmit={refundDeposit}
                  >
                    <p className="text-xs font-semibold uppercase">Deposit refund</p>
                    <p className="theme-subtext text-xs">
                      Deposit on folio: {depositPaid.toFixed(2)}
                      {refunded > 0 ? ` · already refunded ${refunded.toFixed(2)}` : ""} · refundable{" "}
                      {refundableDeposit.toFixed(2)}
                    </p>
                    <Field label="Refund amount">
                      <input
                        required
                        type="number"
                        min="0.01"
                        step="any"
                        max={refundableDeposit}
                        className={inputClassName()}
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        placeholder={String(refundableDeposit)}
                      />
                    </Field>
                    <Field label="Reference">
                      <input
                        className={inputClassName()}
                        value={refundReference}
                        onChange={(e) => setRefundReference(e.target.value)}
                        placeholder="Deposit refund"
                      />
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      <SecondaryButton
                        type="button"
                        disabled={saving}
                        onClick={() => setRefundAmount(String(refundableDeposit))}
                      >
                        Full deposit
                      </SecondaryButton>
                      <PrimaryButton showIcon={false} type="submit" disabled={saving}>
                        Record refund
                      </PrimaryButton>
                    </div>
                  </form>
                ) : null}

                <form className="space-y-2 rounded-lg border border-[var(--theme-border)] p-3" onSubmit={postCharge}>
                  <p className="text-xs font-semibold uppercase">Post charge</p>
                  <Field label="Type">
                    <SearchableSelect
                      className={inputClassName()}
                      value={charge.charge_type}
                      onChange={(v) => setCharge((c) => ({ ...c, charge_type: v }))}
                      options={["room", "fnb", "minibar", "laundry", "other"].map((t) => ({
                        value: t,
                        label: t,
                      }))}
                    />
                  </Field>
                  <Field label="Description">
                    <input
                      required
                      className={inputClassName()}
                      value={charge.description}
                      onChange={(e) => setCharge((c) => ({ ...c, description: e.target.value }))}
                    />
                  </Field>
                  <Field label="Amount">
                    <input
                      required
                      type="number"
                      min="0.01"
                      step="any"
                      className={inputClassName()}
                      value={charge.amount}
                      onChange={(e) => setCharge((c) => ({ ...c, amount: e.target.value }))}
                    />
                  </Field>
                  <PrimaryButton showIcon={false} type="submit" disabled={saving}>
                    Add charge
                  </PrimaryButton>
                </form>

                {balance > 0.009 ? (
                  <div className="space-y-2 rounded-lg border border-[var(--theme-border)] p-3">
                    <p className="text-xs font-semibold uppercase">Take payment</p>
                    <p className="theme-subtext text-xs">
                      Methods come from Admin → Payment methods. Use Full for the folio balance, or Amount →
                      Keypad to enter a partial.
                    </p>
                    <PrimaryButton
                      showIcon={false}
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setPaymentError(null);
                        setPaymentOpen(true);
                      }}
                    >
                      Collect payment
                    </PrimaryButton>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </FormDrawer>

      <HotelPosPaymentPanel
        open={paymentOpen && Boolean(detail)}
        onClose={() => {
          if (!saving) {
            setPaymentOpen(false);
            setPaymentError(null);
          }
        }}
        title="Folio payment"
        footerHint="Tap Full for the folio balance, or Amount → Keypad. Methods are from Admin → Payment methods."
        billTotal={Math.max(0, balance)}
        paymentConfig={paymentConfig}
        saving={saving}
        error={paymentError}
        allowPartial
        roomChargeEnabled={false}
        onComplete={handlePaymentComplete}
      />
    </CatalogPageShell>
  );
}
