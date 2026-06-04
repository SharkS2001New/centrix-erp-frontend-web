/** Default map center — Nairobi CBD */
export const DEFAULT_MAP_CENTER = { lat: -1.286389, lng: 36.817223 };

export function parseCoord(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function hasValidCustomerLocation(lat, lng) {
  return parseCoord(lat) != null && parseCoord(lng) != null;
}

export function customerLocationPayload(lat, lng) {
  const latitude = parseCoord(lat);
  const longitude = parseCoord(lng);
  if (latitude != null && longitude != null) {
    return { latitude, longitude };
  }
  if (latitude != null || longitude != null) {
    throw new Error("Enter both latitude and longitude to save a location.");
  }
  return { latitude: null, longitude: null };
}

export function formatCustomerCoordinates(lat, lng) {
  const latitude = parseCoord(lat);
  const longitude = parseCoord(lng);
  if (latitude == null || longitude == null) return null;
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}
