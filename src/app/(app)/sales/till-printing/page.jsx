import { redirect } from "next/navigation";

/** Local printing (print agent) moved to Administration. */
export default function SalesTillPrintingRedirectPage() {
  redirect("/admin/till-printing");
}
