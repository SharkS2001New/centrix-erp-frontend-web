"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { runLpoPrintClick } from "@/components/lpo/lpo-order-print";

export function LpoLpoNoPrintDeliveryNoteScreen() {
  const params = useParams();
  const lpoNo = params.lpoNo;
  const { user, capabilities } = useAuth();

  async function handlePrint() {
    await runLpoPrintClick(lpoNo, { variant: "delivery_note", user, capabilities });
  }

  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <p className="mb-4 text-sm text-slate-600">
        Delivery note printing now opens the browser print dialog directly from the LPO screen.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={handlePrint}
          className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#144f8a]"
        >
          Print delivery note
        </button>
        <Link
          href={`/lpo/${lpoNo}`}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back to LPO
        </Link>
      </div>
    </div>
  );
}
