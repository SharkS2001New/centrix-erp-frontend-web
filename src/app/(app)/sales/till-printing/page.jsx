import { redirect } from "next/navigation";

/** Till printing moved to Administration. */
export default function SalesTillPrintingRedirectPage() {
  redirect("/admin/till-printing");
}
