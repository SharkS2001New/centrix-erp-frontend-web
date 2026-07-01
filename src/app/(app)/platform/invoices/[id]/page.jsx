"use client";

import { use } from "react";
import { PlatformInvoiceEditorPage } from "@/components/platform/platform-invoice-editor";

export default function EditPlatformInvoicePage({ params }) {
  const { id } = use(params);
  return <PlatformInvoiceEditorPage invoiceId={id} />;
}
