"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { LpoLpoNoPrintDeliveryNoteScreen } from "@/components/tab-screens/lpo-lpoNo-print-delivery-note";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <LpoLpoNoPrintDeliveryNoteScreen />;
}
