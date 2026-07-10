import { redirect } from "next/navigation";

/** Mobile push (FCM) config removed — realtime uses Laravel Reverb. */
export default function PlatformPushRedirectPage() {
  redirect("/platform");
}
