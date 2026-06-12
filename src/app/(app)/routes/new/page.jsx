import { redirect } from "next/navigation";

export default function NewRouteRedirectPage() {
  redirect("/fulfillment/routes?create=1");
}
