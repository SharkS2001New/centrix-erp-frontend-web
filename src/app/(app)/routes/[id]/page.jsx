import { redirect } from "next/navigation";

export default async function RouteDetailRedirectPage({ params }) {
  const { id } = await params;
  redirect(`/fulfillment/routes/${id}`);
}
