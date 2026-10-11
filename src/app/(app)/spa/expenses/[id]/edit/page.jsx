"use client";

import { useParams } from "next/navigation";
import { ExpenseFormScreen } from "@/components/spa/screens/expenses";

export default function SpaExpenseEditPage() {
  const params = useParams();
  return <ExpenseFormScreen id={String(params.id || "")} />;
}
