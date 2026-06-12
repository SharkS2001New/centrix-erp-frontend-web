import { redirect } from "next/navigation";

export default async function EditRouteRedirectPage({ params }) {
  const { id } = await params;
  redirect(`/fulfillment/routes?edit=${id}`);
}
