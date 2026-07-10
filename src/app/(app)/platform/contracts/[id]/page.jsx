"use client";

import { PlatformContractEditorPage } from "@/components/platform/platform-contract-editor";

export default function EditPlatformContractPage({ params }) {
  const id = params?.id;
  return <PlatformContractEditorPage contractId={id} />;
}
