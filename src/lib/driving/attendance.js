function dayOf(value) {
  return String(value || "").slice(0, 10);
}

/**
 * Collapse attendance punches into one row per student per day.
 * Punches from the API arrive oldest-first; the first "in" and last "out" win.
 */
export function attendanceSessions(logs = [], { date = "", search = "" } = {}) {
  const grouped = new Map();
  for (const log of logs) {
    if (!log || log.student_id == null) continue;
    const day = dayOf(log.recorded_at);
    if (date && day !== date) continue;
    const key = `${log.student_id}|${day}`;
    if (!grouped.has(key)) {
      grouped.set(key, { key, student: log.student || null, student_id: log.student_id, day, logs: [] });
    }
    grouped.get(key).logs.push(log);
  }

  const rows = [...grouped.values()].map((row) => {
    const sorted = [...row.logs].sort(
      (a, b) =>
        String(a.recorded_at).localeCompare(String(b.recorded_at)) || Number(a.id || 0) - Number(b.id || 0),
    );
    const checkIn = sorted.find((log) => log.direction === "in") || null;
    const checkOut = [...sorted].reverse().find((log) => log.direction === "out") || null;
    const last = sorted[sorted.length - 1];
    const verification = sorted.find((log) => log.verification && log.verification !== "none");
    return {
      ...row,
      logs: sorted,
      check_in_at: checkIn?.recorded_at || null,
      check_out_at: checkOut?.recorded_at || null,
      status: last?.direction === "in" ? "in" : "out",
      verification: verification?.verification || "none",
      last_at: last?.recorded_at || null,
      student_name: row.student?.full_name || "",
      student_number: row.student?.student_number || "",
      student_phone: row.student?.phone || "",
    };
  });

  const query = search.trim().toLowerCase();
  return rows
    .filter(
      (row) =>
        !query ||
        [row.student_name, row.student_number, row.student_phone]
          .join(" ")
          .toLowerCase()
          .includes(query),
    )
    .sort((a, b) => {
      if (a.day !== b.day) return a.day < b.day ? 1 : -1;
      return a.student_name.localeCompare(b.student_name);
    });
}

/** Minutes on site when both punches exist, otherwise null. */
export function attendanceMinutes(row) {
  if (!row?.check_in_at || !row?.check_out_at) return null;
  const start = new Date(row.check_in_at);
  const end = new Date(row.check_out_at);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
  return Math.round((end - start) / 60000);
}
