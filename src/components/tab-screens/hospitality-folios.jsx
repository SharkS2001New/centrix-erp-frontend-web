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
  SecondaryButton,
  TABLE_BODY_ROW_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_SHELL_CLASS,
} from "@/components/catalog/catalog-shared";
import { HospitalityPlaceholderScreen } from "@/components/hospitality/hospitality-screens";

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
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("open");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [charge, setCharge] = useState({ charge_type: "other", description: "", amount: "" });
  const [payment, setPayment] = useState({ method_code: "CASH", amount: "", reference: "" });
  const [saving, setSaving] = useState(false);

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
      setPayment({ method_code: "CASH", amount: "", reference: "" });
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

  async function postPayment(e) {
    e.preventDefault();
    if (!detail?.id) return;
    setSaving(true);
    try {
      const res = await apiRequest(`/hospitality/folios/${detail.id}/payments`, {
        method: "POST",
        body: {
          method_code: payment.method_code,
          amount: Number(payment.amount),
          reference: payment.reference || null,
        },
      });
      setDetail(res?.folio ?? null);
      notifySuccess("Payment recorded");
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Payment failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CatalogPageShell title="Guest folios" subtitle="Charges, payments, and guest balances.">
      <div className="mb-4 flex flex-wrap gap-2">
        <select className={inputClassName()} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="open">Open</option>
          <option value="checked_out">Checked out</option>
          <option value="">All</option>
        </select>
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
            <p className="text-lg font-semibold tabular-nums">Balance {Number(detail.balance).toFixed(2)}</p>

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
                    <span>{p.method_code}</span>
                    <span className="tabular-nums">{Number(p.amount).toFixed(2)}</span>
                  </li>
                ))}
                {!detail.payments?.length ? <li className="theme-subtext">No payments</li> : null}
              </ul>
            </div>

            {detail.status === "open" ? (
              <>
                <form className="space-y-2 rounded-lg border border-[var(--theme-border)] p-3" onSubmit={postCharge}>
                  <p className="text-xs font-semibold uppercase">Post charge</p>
                  <Field label="Type">
                    <select
                      className={inputClassName()}
                      value={charge.charge_type}
                      onChange={(e) => setCharge((c) => ({ ...c, charge_type: e.target.value }))}
                    >
                      {["room", "fnb", "minibar", "laundry", "other"].map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
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
                <form className="space-y-2 rounded-lg border border-[var(--theme-border)] p-3" onSubmit={postPayment}>
                  <p className="text-xs font-semibold uppercase">Take payment</p>
                  <Field label="Method">
                    <input
                      className={inputClassName()}
                      value={payment.method_code}
                      onChange={(e) => setPayment((p) => ({ ...p, method_code: e.target.value }))}
                    />
                  </Field>
                  <Field label="Amount">
                    <input
                      required
                      type="number"
                      min="0.01"
                      step="any"
                      className={inputClassName()}
                      value={payment.amount}
                      onChange={(e) => setPayment((p) => ({ ...p, amount: e.target.value }))}
                    />
                  </Field>
                  <Field label="Reference">
                    <input
                      className={inputClassName()}
                      value={payment.reference}
                      onChange={(e) => setPayment((p) => ({ ...p, reference: e.target.value }))}
                    />
                  </Field>
                  <PrimaryButton showIcon={false} type="submit" disabled={saving}>
                    Record payment
                  </PrimaryButton>
                </form>
              </>
            ) : null}
          </div>
        ) : null}
      </FormDrawer>
    </CatalogPageShell>
  );
}
