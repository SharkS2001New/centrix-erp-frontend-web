"use client";

import PosScreen from "@/components/sales/pos-screen";
import { useTabTitle } from "@/contexts/tab-workspace-context";

export default function PosPage() {
  useTabTitle("Create order");
  return <PosScreen />;
}
