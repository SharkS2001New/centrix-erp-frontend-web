/**
 * Hotel room numbers for backoffice bulk create — same sequence Hotel POS sells by room_number.
 */

export function expandHotelRoomNumbers(start, count) {
  const raw = String(start ?? "").trim();
  const n = Number(count);
  if (!raw) {
    throw new Error("Start room number is required.");
  }
  if (!Number.isInteger(n) || n < 1 || n > 50) {
    throw new Error("Create between 1 and 50 rooms at a time.");
  }
  const match = raw.match(/^(.*?)(\d+)$/);
  if (!match) {
    throw new Error("Start with a number (101) or a prefix plus digits (G01).");
  }
  const prefix = match[1];
  const seed = Number(match[2]);
  const pad = match[2].length;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push(`${prefix}${String(seed + i).padStart(pad, "0")}`);
  }
  return out;
}

export function occupancySourceLabel(source) {
  if (source === "pos_room_sale") return "Hotel POS";
  if (source === "pms_folio") return "Front desk folio";
  if (source === "pms_occupancy") return "Front desk";
  return "Available";
}
