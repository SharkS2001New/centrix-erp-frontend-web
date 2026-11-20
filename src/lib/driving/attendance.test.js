import { describe, expect, it } from "vitest";
import { attendanceMinutes, attendanceSessions } from "@/lib/driving/attendance";

const student = { id: 1, full_name: "Amina Wanjiru", student_number: "DS-1", phone: "0711000001" };

function log(id, direction, recordedAt, extra = {}) {
  return { id, student_id: 1, direction, recorded_at: recordedAt, verification: "none", student, ...extra };
}

describe("driving attendance sessions", () => {
  it("pairs the first check-in with the last check-out", () => {
    const rows = attendanceSessions([
      log(1, "in", "2026-11-20T08:00:00"),
      log(2, "out", "2026-11-20T10:00:00"),
      log(3, "in", "2026-11-20T11:00:00"),
      log(4, "out", "2026-11-20T13:30:00"),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].check_in_at).toBe("2026-11-20T08:00:00");
    expect(rows[0].check_out_at).toBe("2026-11-20T13:30:00");
    expect(rows[0].status).toBe("out");
    expect(attendanceMinutes(rows[0])).toBe(330);
  });

  it("marks a student still checked in as in", () => {
    const rows = attendanceSessions([log(1, "in", "2026-11-20T08:00:00")]);
    expect(rows[0].status).toBe("in");
    expect(rows[0].check_out_at).toBeNull();
    expect(attendanceMinutes(rows[0])).toBeNull();
  });

  it("splits students by day and keeps only the requested date", () => {
    const yesterday = log(1, "in", "2026-11-19T08:00:00");
    const today = log(2, "in", "2026-11-20T08:00:00");
    expect(attendanceSessions([yesterday, today])).toHaveLength(2);
    const onlyToday = attendanceSessions([yesterday, today], { date: "2026-11-20" });
    expect(onlyToday).toHaveLength(1);
    expect(onlyToday[0].day).toBe("2026-11-20");
  });

  it("filters by student name, number or phone", () => {
    const rows = [log(1, "in", "2026-11-20T08:00:00")];
    expect(attendanceSessions(rows, { search: "amina" })).toHaveLength(1);
    expect(attendanceSessions(rows, { search: "DS-1" })).toHaveLength(1);
    expect(attendanceSessions(rows, { search: "0711" })).toHaveLength(1);
    expect(attendanceSessions(rows, { search: "brian" })).toHaveLength(0);
  });

  it("carries the first non-none verification mark", () => {
    const rows = attendanceSessions([
      log(1, "in", "2026-11-20T08:00:00", { verification: "signature" }),
      log(2, "out", "2026-11-20T10:00:00"),
    ]);
    expect(rows[0].verification).toBe("signature");
  });
});
