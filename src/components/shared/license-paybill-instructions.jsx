"use client";

import { formatBillingMoney } from "@/lib/platform-billing";

/**
 * How to renew on the Centrix Paybill. Shown when a licence is close to expiry or already locked.
 */
export function LicensePaybillInstructions({ paybill, className = "" }) {
  if (!paybill?.short_code) return null;

  const currency = paybill.currency || "KES";
  const prices = [
    paybill.monthly_price != null
      ? `Monthly ${formatBillingMoney(paybill.monthly_price, currency)} for 30 days`
      : null,
    paybill.yearly_price != null
      ? `Yearly ${formatBillingMoney(paybill.yearly_price, currency)} for 1 year`
      : null,
    paybill.token_pack_price != null
      ? `Tokens: pay any amount, 1 KES = 1 token (for example ${formatBillingMoney(paybill.token_pack_price, currency)} = ${Number(paybill.token_pack_price)} tokens)`
      : "Tokens: the shillings you pay become tokens. Creates, updates, and deletes spend tokens. Reading is free.",
  ].filter(Boolean);

  return (
    <div className={`rounded-lg border border-current/15 bg-white/70 px-3 py-2 text-sm ${className}`}>
      <p className="font-medium">Pay with M-Pesa Paybill</p>
      <p className="mt-1">
        Paybill <span className="font-mono font-semibold">{paybill.short_code}</span>
        {paybill.account_number ? (
          <>
            {" "}
            · Account <span className="font-mono font-semibold">{paybill.account_number}</span>
          </>
        ) : null}
        {paybill.account_phone ? (
          <>
            {" "}
            or <span className="font-mono font-semibold">{paybill.account_phone}</span>
          </>
        ) : null}
      </p>
      {prices.length > 0 ? (
        <ul className="mt-1 list-disc pl-4 text-xs">
          {prices.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs">Use the amount for your monthly, yearly, or token plan.</p>
      )}
    </div>
  );
}
