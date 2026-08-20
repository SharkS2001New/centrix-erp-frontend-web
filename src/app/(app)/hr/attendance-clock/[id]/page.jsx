import { redirect } from "next/navigation";
import { attendanceClockDeviceHref } from "@/lib/attendance-clock-paths";

/** Device setup moved to Administration only (same as Local printing). */
export default async function Page({ params }) {
  const { id } = await params;
  redirect(attendanceClockDeviceHref("", id));
}
