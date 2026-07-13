"use client";

import { formatLpoPackQtyDisplay } from "@/components/lpo/lpo-product-utils";
import {
  formatLinePackQty,
  lpoLineOfferQty,
  packQtyFromReceiveBase,
} from "@/components/inventory/lpo-receive-stock";

export function LpoReceivedQtyCell({ line, uom, sessionOfferBase = 0, className = "" }) {
  const receivedLabel = formatLpoPackQtyDisplay(line.received_qty ?? 0, uom);
  const storedOffer = lpoLineOfferQty(line);
  const sessionOfferPack =
    sessionOfferBase > 0 ? packQtyFromReceiveBase(sessionOfferBase, uom) : 0;
  const sessionOfferLabel =
    sessionOfferPack > 0 ? formatLinePackQty(sessionOfferPack, uom) : null;
  const storedOfferLabel = storedOffer > 0 ? formatLinePackQty(storedOffer, uom) : null;

  return (
    <div className={className}>
      <span className="tabular-nums">{receivedLabel}</span>
      {sessionOfferLabel ? (
        <span className="mt-0.5 block text-[11px] font-medium text-amber-700">
          + {sessionOfferLabel} offer
        </span>
      ) : storedOfferLabel ? (
        <span className="mt-0.5 block text-[11px] font-medium text-amber-700">
          incl. {storedOfferLabel} offer
        </span>
      ) : null}
    </div>
  );
}
