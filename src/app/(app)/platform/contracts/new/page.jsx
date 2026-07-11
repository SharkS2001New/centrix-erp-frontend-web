"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PlatformContractEditorPage } from "@/components/platform/platform-contract-editor";

function NewContractInner() {
  const searchParams = useSearchParams();
  const kind = searchParams.get("kind") === "contract" ? "contract" : "quote";
  return <PlatformContractEditorPage initialKind={kind} />;
}

export default function NewPlatformContractPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-500">Loading…</p>}>
      <NewContractInner />
    </Suspense>
  );
}
