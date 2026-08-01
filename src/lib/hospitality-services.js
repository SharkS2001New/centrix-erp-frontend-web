/** Platform-controlled hospitality services — default: Main outlet + Rooms. */

export const HOSPITALITY_SERVICE_DEFAULTS = {
  rooms: true,
  reservations: false,
  front_desk: false,
  folios: false,
  housekeeping: false,
  night_audit: false,
  extra_outlets: false,
  floor_tables: false,
  table_pos: false,
  room_charge: false,
};

export const HOSPITALITY_SERVICE_CATALOG = [
  { key: "rooms", label: "Rooms", description: "Room types and room inventory (default on)." },
  { key: "reservations", label: "Reservations", description: "Booking calendar and reservation management." },
  { key: "front_desk", label: "Front desk", description: "Check-in / check-out and room assignment." },
  { key: "folios", label: "Guest folios", description: "Guest accounts, charges, and folio payments." },
  { key: "housekeeping", label: "Housekeeping", description: "Room status board (clean / dirty / OOO)." },
  { key: "night_audit", label: "Night audit", description: "End-of-day close and room charge posting." },
  { key: "extra_outlets", label: "Extra outlets", description: "Manage outlets beyond the default Main outlet." },
  { key: "floor_tables", label: "Floor tables", description: "Restaurant / bar table map for dine-in." },
  { key: "table_pos", label: "Table POS mode", description: "Open checks by table on Hotel & Bar POS." },
  { key: "room_charge", label: "Room charge from POS", description: "Post bar checks to a guest folio." },
];

export function normalizeHospitalityServices(raw) {
  const out = { ...HOSPITALITY_SERVICE_DEFAULTS };
  if (!raw || typeof raw !== "object") return out;
  for (const key of Object.keys(out)) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      out[key] = Boolean(raw[key]);
    }
  }
  return out;
}

export function resolveHospitalityServices(capabilitiesOrSettings = null) {
  const hospitality =
    capabilitiesOrSettings?.module_settings?.hospitality ??
    capabilitiesOrSettings?.hospitality ??
    capabilitiesOrSettings?.module_settings ??
    capabilitiesOrSettings;
  const fromServices = hospitality?.services;
  const fromPlatform = capabilitiesOrSettings?.hospitality_services;
  return normalizeHospitalityServices(fromServices ?? fromPlatform);
}

export function isHospitalityServiceEnabled(capabilitiesOrSettings, serviceKey) {
  if (serviceKey === "main_outlet") return true;
  const services = resolveHospitalityServices(capabilitiesOrSettings);
  return Boolean(services[serviceKey]);
}
