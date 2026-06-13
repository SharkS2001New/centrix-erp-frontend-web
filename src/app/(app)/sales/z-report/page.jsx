import { redirect } from "next/navigation";

export default function SalesZReportRedirectPage() {
  redirect("/sales/till-management?tab=history");
}
