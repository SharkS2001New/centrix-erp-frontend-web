import { redirect } from "next/navigation";

/** @deprecated Use /platform/settings?tab=email */
export default function PlatformEmailRedirectPage() {
  redirect("/platform/settings?tab=email");
}
