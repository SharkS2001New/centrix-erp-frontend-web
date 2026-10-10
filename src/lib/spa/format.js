export function ksh(value) {
  const amount = Math.round(Number(value) || 0);
  const sign = amount < 0 ? "-" : "";
  const formatted = Math.abs(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `KSh ${sign}${formatted}`;
}

export function todayISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function shiftISO(dayOffset, time = "09:00") {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  return `${todayISO(date)}T${time}:00`;
}

export function datePart(value) {
  return String(value || "").slice(0, 10);
}

export function timePart(value) {
  return String(value || "").slice(11, 16) || "09:00";
}

export function minutesOf(value) {
  const [h, m] = timePart(value).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function formatTime(value) {
  const mins = minutesOf(value);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatDay(iso) {
  const date = new Date(`${iso}T12:00:00`);
  return date.toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" });
}

export function formatLong(iso) {
  const date = new Date(`${iso}T12:00:00`);
  return date.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function businessLabel(type) {
  if (type === "spa") return "Centrix SPA";
  if (type === "kinyozi") return "Centrix Kinyozi";
  return "Centrix SPA & Kinyozi";
}

export function featuresFor(type) {
  const spa = type === "spa" || type === "combined";
  const kinyozi = type === "kinyozi" || type === "combined";
  return {
    rooms: spa,
    packages: spa,
    sessions: spa,
    chairs: kinyozi,
    walkIns: true,
    combos: kinyozi,
  };
}

export function resolveSpaFeatures(type, overrides = {}) {
  const base = featuresFor(type);
  const next = { ...base };
  for (const key of Object.keys(base)) {
    if (typeof overrides?.[key] === "boolean") next[key] = overrides[key];
  }
  return next;
}

export function stockStatus(product) {
  const qty = Number(product.qty) || 0;
  if (qty <= 0) return "Out of stock";
  if (qty <= Number(product.reorder || 0)) return "Low stock";
  return "In stock";
}
