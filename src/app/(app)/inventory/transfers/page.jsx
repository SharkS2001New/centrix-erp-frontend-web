import { redirect } from "next/navigation";

export default function InventoryTransfersRedirectPage() {
  redirect("/inventory/transfers/new");
}
