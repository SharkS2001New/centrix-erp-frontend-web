const pad2 = (value) => String(value).padStart(2, "0");

export function buildBookingHref({ dateIso = "", hour = 9, instructorId = "", vehicleId = "", branchId = "" } = {}) {
  const params = new URLSearchParams();
  if (dateIso) params.set("date", dateIso);
  params.set("time", `${pad2(hour)}:00`);
  if (instructorId) params.set("instructor", String(instructorId));
  if (vehicleId) params.set("vehicle", String(vehicleId));
  if (branchId) params.set("branch", String(branchId));
  return `/driving-school/schedule/new?${params.toString()}`;
}

export function bookingPresetFromSearch(search = "") {
  const params = new URLSearchParams(search || "");
  const date = params.get("date") || "";
  const time = params.get("time") || "";
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const validTime = /^\d{2}:\d{2}$/.test(time);
  return {
    date: validDate ? date : "",
    starts_at: validDate ? `${date}T${validTime ? time : "09:00"}` : "",
    instructor_id: params.get("instructor") || "",
    vehicle_id: params.get("vehicle") || "",
    branch_id: params.get("branch") || "",
  };
}
