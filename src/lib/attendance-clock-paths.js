/** Clock-in device setup lives only in Administration (same pattern as Local printing). */
export const ATTENDANCE_CLOCK_ADMIN_PATH = "/admin/attendance-clock";
export const ATTENDANCE_CLOCK_ADMIN_LABEL = "Attendance clock-in";

export function attendanceClockBasePath() {
  return ATTENDANCE_CLOCK_ADMIN_PATH;
}

export function attendanceClockListHref() {
  return ATTENDANCE_CLOCK_ADMIN_PATH;
}

export function attendanceClockDeviceHref(_pathname = "", deviceId) {
  return `${ATTENDANCE_CLOCK_ADMIN_PATH}/${deviceId}`;
}
