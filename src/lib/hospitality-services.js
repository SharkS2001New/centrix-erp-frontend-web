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
  { key: "rooms", label: "Rooms", description: "Room types and inventory. Optional — Hotel & Bar POS sells without rooms." },
  { key: "reservations", label: "Reservations", description: "Booking calendar and reservation management." },
  { key: "front_desk", label: "Front desk", description: "Assign rooms, check-in / check-out. Works with or without guest folios." },
  {
    key: "folios",
    label: "Guest folios (pay later)",
    description:
      "Running guest bill for room + extras. Leave off for pay-at-check-in hotels — guests pay before keys; F&B is pay-at-till.",
  },
  { key: "housekeeping", label: "Housekeeping", description: "Room status board (clean / dirty / OOO)." },
  {
    key: "night_audit",
    label: "Night audit",
    description: "End-of-day close and room charge posting to open folios. Requires Guest folios.",
  },
  { key: "extra_outlets", label: "Extra outlets", description: "Manage outlets beyond the default Main outlet." },
  { key: "floor_tables", label: "Floor tables", description: "Create and manage restaurant / bar tables." },
  { key: "table_pos", label: "Table POS mode", description: "Cashier must select a table before adding items, saving, or collecting payment." },
  {
    key: "room_charge",
    label: "Room charge from POS",
    description: "Post bar/restaurant checks to an open guest folio. Requires Guest folios. Leave off if F&B is collect-payment only.",
  },
];

export function normalizeHospitalityServices(raw) {
  const out = { ...HOSPITALITY_SERVICE_DEFAULTS };
  if (!raw || typeof raw !== "object") return out;
  for (const key of Object.keys(out)) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      out[key] = Boolean(raw[key]);
    }
  }
  // Room charge / night audit need open guest folios.
  if (out.room_charge || out.night_audit) {
    out.folios = true;
  }
  if (!out.folios) {
    out.room_charge = false;
    out.night_audit = false;
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
