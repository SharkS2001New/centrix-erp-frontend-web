import { redirect } from "next/navigation";

/** Field attendance is now part of the unified HR attendance page. */
export default function HrFieldAttendanceRedirectPage() {
  redirect("/hr/attendance#field-sessions");
}
