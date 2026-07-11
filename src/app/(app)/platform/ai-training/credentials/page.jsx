import { redirect } from "next/navigation";

/** @deprecated Use /platform/settings?tab=ai */
export default function PlatformAiCredentialsRedirectPage() {
  redirect("/platform/settings?tab=ai");
}
