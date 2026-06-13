import { redirect } from "next/navigation";

export default function CloseSessionRedirectPage() {
  redirect("/sales/pos");
}
