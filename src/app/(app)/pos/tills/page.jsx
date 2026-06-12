import { redirect } from "next/navigation";

export default function PosTillsRedirectPage() {
  redirect("/sales/till-management?tab=tills");
}
