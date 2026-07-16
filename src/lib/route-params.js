/** Normalize Next.js useParams() values (string | string[]). */
export function routeParamValue(value) {
  if (value == null) return "";
  const raw = Array.isArray(value) ? value[0] : value;
  return raw == null ? "" : String(raw).trim();
}

/** Reject missing / literal "undefined" / "null" segments from bad tab deep-links. */
export function isUsableRouteParam(value) {
  const s = routeParamValue(value);
  return Boolean(s) && s !== "undefined" && s !== "null";
}

/** Numeric primary keys (customer invoices, trips, etc.). */
export function isNumericRouteId(value) {
  return isUsableRouteParam(value) && /^\d+$/.test(routeParamValue(value));
}
