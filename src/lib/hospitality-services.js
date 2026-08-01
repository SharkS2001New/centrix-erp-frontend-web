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
  { key: "front_desk", label: "Front desk", description: "Check-in / check-out and room assignment." },
  { key: "folios", label: "Guest folios", description: "Guest accounts, charges, and folio payments." },
  { key: "housekeeping", label: "Housekeeping", description: "Room status board (clean / dirty / OOO)." },
  { key: "night_audit", label: "Night audit", description: "End-of-day close and room charge posting." },
  { key: "extra_outlets", label: "Extra outlets", description: "Manage outlets beyond the default Main outlet." },
  { key: "floor_tables", label: "Floor tables", description: "Create and manage restaurant / bar tables." },
  { key: "table_pos", label: "Table POS mode", description: "Cashier must select a table before adding items, saving, or collecting payment." },
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

/**
 * Hotel POS header chips that open Hospitality Backoffice modules on tap.
 * Only services that are enabled for the org are returned (plus Orders).
 */
export const HOTEL_POS_MODULE_SHORTCUT_DEFS = [
  { id: "rooms", service: "rooms", label: "Rooms", short: "Rooms", href: "/hospitality/rooms" },
  {
    id: "reservations",
    service: "reservations",
    label: "Reservations",
    short: "Reserv.",
    href: "/hospitality/reservations",
  },
  {
    id: "front_desk",
    service: "front_desk",
    label: "Front desk",
    short: "Desk",
    href: "/hospitality/front-desk",
  },
  { id: "folios", service: "folios", label: "Folios", short: "Folios", href: "/hospitality/folios" },
  {
    id: "housekeeping",
    service: "housekeeping",
    label: "Housekeeping",
    short: "HK",
    href: "/hospitality/housekeeping",
  },
  {
    id: "outlets",
    service: "extra_outlets",
    label: "Outlets",
    short: "Outlets",
    href: "/hospitality/outlets",
  },
  {
    id: "night_audit",
    service: "night_audit",
    label: "Night audit",
    short: "Audit",
    href: "/hospitality/night-audit",
  },
  {
    id: "orders",
    service: null,
    label: "Orders",
    short: "Orders",
    href: "/hospitality/orders",
    always: true,
  },
];

export function hotelPosModuleShortcuts(capabilitiesOrSettings) {
  return HOTEL_POS_MODULE_SHORTCUT_DEFS.filter((item) => {
    if (item.always) return true;
    return isHospitalityServiceEnabled(capabilitiesOrSettings, item.service);
  }).map(({ id, label, short, href }) => ({ id, label, short, href }));
}
