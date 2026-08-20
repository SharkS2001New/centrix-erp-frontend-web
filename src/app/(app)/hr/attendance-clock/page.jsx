import { redirect } from "next/navigation";
import { ATTENDANCE_CLOCK_ADMIN_PATH } from "@/lib/attendance-clock-paths";

/** Device setup moved to Administration only (same as Local printing). */
export default function Page() {
  redirect(ATTENDANCE_CLOCK_ADMIN_PATH);
}
