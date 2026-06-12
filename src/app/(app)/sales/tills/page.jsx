import { redirect } from "next/navigation";

export default function LegacyTillsRedirect() {
  redirect("/sales/till-management?tab=tills");
}
