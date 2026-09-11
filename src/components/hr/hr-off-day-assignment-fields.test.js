import { describe, expect, it } from "vitest";
import {
  buildOffDayBody,
  buildOffDayEmptyForm,
  validateOffDayForm,
} from "@/components/hr/hr-off-day-assignment-fields";

describe("hourly leave application", () => {
  it("sends hours and a single date for hourly duration", () => {
    const form = {
      ...buildOffDayEmptyForm(),
      employee_id: "12",
      start_date: "2026-09-11",
      end_date: "2026-09-20",
      duration_type: "hourly",
      hours: "1",
      notes: "Clinic appointment",
    };

    expect(validateOffDayForm(form)).toBeNull();
    expect(buildOffDayBody(form)).toMatchObject({
      employee_id: 12,
      start_date: "2026-09-11",
      end_date: "2026-09-11",
      duration_type: "hourly",
      hours: 1,
      half_day_period: null,
    });
  });

  it("rejects hourly leave without hours", () => {
    const form = {
      ...buildOffDayEmptyForm(),
      employee_id: "12",
      start_date: "2026-09-11",
      duration_type: "hourly",
      hours: "0",
      notes: "Clinic appointment",
    };
    expect(validateOffDayForm(form)).toMatch(/hours/i);
  });
});
