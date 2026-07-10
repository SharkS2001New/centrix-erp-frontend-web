"use client";

import { use } from "react";
import { PlatformContractEditorPage } from "@/components/platform/platform-contract-editor";

export default function EditPlatformContractPage({ params }) {
  const { id } = use(params);
  return <PlatformContractEditorPage contractId={id} />;
}
