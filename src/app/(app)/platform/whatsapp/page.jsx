import { redirect } from "next/navigation";

/** @deprecated Use /platform/settings?tab=whatsapp */
export default function PlatformWhatsappRedirectPage() {
  redirect("/platform/settings?tab=whatsapp");
}
