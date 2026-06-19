const NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse";
const USER_AGENT = "centrix-erp-web/1.0 (customer-location; contact: admin@local)";

let lastRequestAt = 0;

async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, 1100 - (now - lastRequestAt));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

/**
 * Resolve a human-readable place name from coordinates (OpenStreetMap Nominatim).
 * @returns {Promise<string|null>}
 */
export async function reverseGeocode(latitude, longitude, { signal } = {}) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  await throttle();

  const url = new URL(NOMINATIM_REVERSE);
  url.searchParams.set("format", "json");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");

  const res = await fetch(url.toString(), {
    signal,
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
  });

  if (!res.ok) return null;

  const data = await res.json();
  if (data?.display_name) return data.display_name;

  const addr = data?.address;
  if (!addr) return null;

  const parts = [
    addr.shop,
    addr.amenity,
    addr.building,
    addr.road,
    addr.neighbourhood,
    addr.suburb,
    addr.town || addr.city || addr.village,
    addr.county,
    addr.country,
  ].filter(Boolean);

  return parts.length ? [...new Set(parts)].join(", ") : null;
}
