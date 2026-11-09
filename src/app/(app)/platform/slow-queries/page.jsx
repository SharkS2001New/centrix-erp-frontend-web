import { redirect } from "next/navigation";

/** Legacy route — slow API triage lives under System errors; DB cleanup under Data retention. */
export default function PlatformSlowQueriesRedirect() {
  redirect("/platform/system-issues?kind=slow");
}
