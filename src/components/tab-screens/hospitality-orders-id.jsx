"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  CatalogPageShell,
  PrimaryButton,
  SecondaryButton,
  TABLE_BODY_ROW_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_SHELL_CLASS,
} from "@/components/catalog/catalog-shared";
import { printHospitalityCheckReceipt } from "@/components/hospitality/hospitality-check-receipt-print";
import { fetchHotelPosSettings } from "@/lib/hospitality-pos-api";
import {
  buildHospitalityCheckPrintOptions,
  normalizeHospitalityCheckPrintSettings,
} from "@/lib/hospitality-check-print-options";
import { isPrintAgentEnabled, warmPrintAgentHealth } from "@/lib/print-agent";

function formatMoney(value) {
  return Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function MetaRow({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="theme-subtext text-xs font-semibold uppercase tracking-wide">{label}</dt>
      <dd className="text-sm font-medium text-[var(--theme-text)]">{children}</dd>
    </div>
  );
}

export function HospitalityOrderDetailScreen({ checkId: checkIdProp = null } = {}) {
  const params = useParams();
  const router = useRouter();
  const { organization, capabilities, user } = useAuth();
  const checkId = checkIdProp ?? params?.id;

  const [check, setCheck] = useState(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [printSettings, setPrintSettings] = useState(null);

  const load = useCallback(async () => {
    if (!checkId) return;
    setLoading(true);
    try {
      const [res, settings] = await Promise.all([
        apiRequest(`/hospitality/checks/${checkId}`),
        fetchHotelPosSettings().catch(() => null),
      ]);
      setCheck(res?.check ?? null);
      if (settings) {
        setPrintSettings(normalizeHospitalityCheckPrintSettings(settings));
      }
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load order");
      setCheck(null);
    } finally {
      setLoading(false);
    }
  }, [checkId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isPrintAgentEnabled()) return;
    void warmPrintAgentHealth();
  }, []);

  async function handlePrint() {
    if (!check || printing) return;
    setPrinting(true);
    try {
      const result = await printHospitalityCheckReceipt(
        check,
        buildHospitalityCheckPrintOptions({
          checkPrintSettings: printSettings,
          organization,
          capabilities,
          user,
          title: "Order receipt",
        }),
      );
      if (result?.ok) {
        notifySuccess("Receipt sent to printer");
      }
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Print failed");
    } finally {
      setPrinting(false);
    }
  }

  const guestNameEnabled = printSettings?.enable_check_guest_name === true;
  const tableLabel = check?.floor_table?.label || check?.floor_table?.code || "—";
  const outletLabel = check?.outlet?.name || check?.outlet?.code || "—";
  const payments = Array.isArray(check?.payments) ? check.payments : [];
  const lines = Array.isArray(check?.lines) ? check.lines : [];

  if (loading) {
    return (
      <CatalogPageShell title="F&B order" subtitle="Loading check details…">
        <p className="theme-subtext text-sm">Loading…</p>
      </CatalogPageShell>
    );
  }

  if (!check) {
    return (
      <CatalogPageShell title="F&B order" subtitle="Order not found">
        <p className="theme-subtext text-sm">This check could not be loaded.</p>
        <SecondaryButton className="mt-4" onClick={() => router.push("/hospitality/orders")}>
          Back to F&B orders
        </SecondaryButton>
      </CatalogPageShell>
    );
  }

  return (
    <CatalogPageShell
      title={`Order ${check.check_number || check.order_num}`}
      subtitle="Hotel POS order — same summary layout as backoffice: lines, totals, payments, and print."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <SecondaryButton onClick={() => router.push("/hospitality/orders")}>
            Back
          </SecondaryButton>
          <PrimaryButton
            showIcon={false}
            onClick={() => void handlePrint()}
            disabled={printing}
          >
            {printing ? "Printing…" : "Print receipt"}
          </PrimaryButton>
        </div>
      }
    >
      <div className="space-y-6">
        <section className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 sm:p-5">
          <h2 className="theme-heading text-sm font-semibold">Summary</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MetaRow label="Status">
              <span className="capitalize">{String(check.status ?? "").replace(/_/g, " ")}</span>
            </MetaRow>
            <MetaRow label="Order #">{check.check_number || check.order_num || "—"}</MetaRow>
            <MetaRow label="Source">
              {String(check.order_source || "").includes("offline")
                ? "Hotel POS (offline)"
                : "Hotel POS"}
            </MetaRow>
            <MetaRow label="Method">{check.payment_method_label || "—"}</MetaRow>
            <MetaRow label="Placed by">{check.opened_by_name || "—"}</MetaRow>
            <MetaRow label="Outlet">{outletLabel}</MetaRow>
            <MetaRow label="Table">{tableLabel}</MetaRow>
            <MetaRow label="Service">
              <span className="capitalize">{check.service_mode || "—"}</span>
            </MetaRow>
            {guestNameEnabled || check.guest_name ? (
              <MetaRow label="Guest">{check.guest_name || "—"}</MetaRow>
            ) : null}
            {check.folio?.folio_number ? (
              <MetaRow label="Folio">
                {check.folio.folio_number}
                {check.folio.room_number ? ` · Rm ${check.folio.room_number}` : ""}
              </MetaRow>
            ) : null}
            <MetaRow label="Opened">{formatWhen(check.opened_at || check.created_at)}</MetaRow>
            <MetaRow label="Closed">{formatWhen(check.closed_at)}</MetaRow>
            <MetaRow label="Updated">{formatWhen(check.updated_at)}</MetaRow>
          </dl>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="theme-heading text-sm font-semibold">Order lines</h2>
            <span className="theme-subtext text-xs">{lines.length} item{lines.length === 1 ? "" : "s"}</span>
          </div>
          <div className={TABLE_SHELL_CLASS}>
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className={TABLE_HEAD_ROW_CLASS}>
                  <th className="px-3 py-2 font-semibold">Item</th>
                  <th className="px-3 py-2 font-semibold text-right">Qty</th>
                  <th className="px-3 py-2 font-semibold text-right">Unit</th>
                  <th className="px-3 py-2 font-semibold text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr className={TABLE_BODY_ROW_CLASS}>
                    <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                      No lines on this check.
                    </td>
                  </tr>
                ) : (
                  lines.map((line) => (
                    <tr key={line.id} className={TABLE_BODY_ROW_CLASS}>
                      <td className="px-3 py-2">
                        <p className="font-medium">{line.description}</p>
                        {line.product_code ? (
                          <p className="theme-subtext text-xs font-mono">{line.product_code}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{line.qty}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoney(line.unit_price)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {formatMoney(line.line_total)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 sm:p-5">
            <h2 className="theme-heading text-sm font-semibold">Totals</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="theme-subtext">Subtotal</dt>
                <dd className="tabular-nums">{formatMoney(check.subtotal)}</dd>
              </div>
              {Number(check.vat_total) > 0 ? (
                <div className="flex justify-between gap-4">
                  <dt className="theme-subtext">VAT</dt>
                  <dd className="tabular-nums">{formatMoney(check.vat_total)}</dd>
                </div>
              ) : null}
              {Number(check.service_charge) > 0 ? (
                <div className="flex justify-between gap-4">
                  <dt className="theme-subtext">Service charge</dt>
                  <dd className="tabular-nums">{formatMoney(check.service_charge)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4 border-t border-[var(--theme-border)] pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatMoney(check.total)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="theme-subtext">Paid</dt>
                <dd className="tabular-nums">{formatMoney(check.amount_paid)}</dd>
              </div>
              <div className="flex justify-between gap-4 font-semibold">
                <dt>Balance due</dt>
                <dd className="tabular-nums">{formatMoney(check.balance_due)}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 sm:p-5">
            <h2 className="theme-heading text-sm font-semibold">Payments</h2>
            {payments.length === 0 ? (
              <p className="theme-subtext mt-3 text-sm">No payments recorded.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {payments.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-[var(--theme-border)] px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{p.method_code || "Payment"}</p>
                      <p className="theme-subtext text-xs">{formatWhen(p.created_at)}</p>
                      {p.reference ? (
                        <p className="theme-subtext text-xs">Ref: {p.reference}</p>
                      ) : null}
                    </div>
                    <p className="font-semibold tabular-nums">{formatMoney(p.amount)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <p className="theme-subtext text-xs">
          Receipt layout is configured under{" "}
          <Link href="/admin/settings" className="font-semibold underline">
            Organization settings → Printouts → Hotel checks
          </Link>
          .
        </p>
      </div>
    </CatalogPageShell>
  );
}
