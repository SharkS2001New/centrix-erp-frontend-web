/** Leave duration kinds on employee_leave_days.duration_type */
export const LEAVE_DURATION_TYPES = [
  { value: "full_day", label: "Full day(s)" },
  { value: "half_day", label: "Half day (single date)" },
  { value: "hourly", label: "Hours (single date)" },
];

export function isSingleDateLeaveDuration(durationType) {
  return durationType === "half_day" || durationType === "hourly";
}

export function parseLeaveHours(value) {
  const hours = Number(value);
  if (!Number.isFinite(hours)) return 0;
  return Math.round(hours * 100) / 100;
}

export function leaveHoursAreValid(value) {
  const hours = parseLeaveHours(value);
  return hours >= 0.25;
}

export function leaveDurationLabel(record) {
  if (record?.duration_type === "hourly") {
    const hours = parseLeaveHours(record?.total_hours ?? record?.hours ?? 0);
    if (hours <= 0) return "Hours";
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  if (record?.duration_type === "half_day") {
    const period = record?.half_day_period === "afternoon" ? "Afternoon" : "Morning";
    return `Half day (${period})`;
  }
  const days = Number(record?.total_days ?? record?.days_deducted ?? 0);
  if (days <= 0) return "Full day(s)";
  return days === 1 ? "1 working day" : `${days} working days`;
}
