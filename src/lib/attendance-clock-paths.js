/** Clock-in setup lives in Administration and is mirrored under HR. */
export function attendanceClockBasePath(pathname = "") {
  return String(pathname).startsWith("/admin/attendance-clock")
    ? "/admin/attendance-clock"
    : "/hr/attendance-clock";
}

export function attendanceClockListHref(pathname = "") {
  return attendanceClockBasePath(pathname);
}

export function attendanceClockDeviceHref(pathname = "", deviceId) {
  return `${attendanceClockBasePath(pathname)}/${deviceId}`;
}
