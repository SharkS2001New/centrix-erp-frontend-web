import { redirect } from "next/navigation";

export default function LegacySessionsRedirect() {
  redirect("/sales/till-management?tab=history");
}
