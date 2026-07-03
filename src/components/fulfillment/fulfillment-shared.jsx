"use client";

import {
  getSaleTimestamp,
  isSameCalendarDay,
  isSameCalendarMonth,
} from "@/components/catalog/catalog-shared";

export const EMPTY_DRIVER_FORM = {
  full_name: "",
  phone: "",
  driver_code: "",
  is_active: true,
  user_id: "",
  employee_id: "",
  default_vehicle_id: "",
  default_route_id: "",
};

export const EMPTY_VEHICLE_FORM = {
  vehicle_code: "",
  vehicle_name: "",
  plate_number: "",
  max_weight_kg: "",
  max_volume_m3: "",
  is_active: true,
};

export function driverToForm(driver) {
  return {
    full_name: driver.full_name ?? "",
    phone: driver.phone ?? "",
    driver_code: driver.driver_code ?? "",
    is_active: driver.is_active !== false,
    user_id: driver.user_id != null ? String(driver.user_id) : "",
    employee_id: driver.employee_id != null ? String(driver.employee_id) : "",
    default_vehicle_id:
      driver.default_vehicle_id != null ? String(driver.default_vehicle_id) : "",
    default_route_id: driver.default_route_id != null ? String(driver.default_route_id) : "",
  };
}

export function vehicleToForm(vehicle) {
  return {
    vehicle_code: vehicle.vehicle_code ?? "",
    vehicle_name: vehicle.vehicle_name ?? "",
    plate_number: vehicle.plate_number ?? "",
    max_weight_kg: vehicle.max_weight_kg != null ? String(vehicle.max_weight_kg) : "",
    max_volume_m3: vehicle.max_volume_m3 != null ? String(vehicle.max_volume_m3) : "",
    is_active: vehicle.is_active !== false,
  };
}

export function buildDriverBody(form, branchId) {
  return {
    branch_id: branchId,
    full_name: form.full_name.trim(),
    phone: form.phone.trim() || null,
    driver_code: form.driver_code.trim(),
    is_active: form.is_active,
    user_id: form.user_id ? Number(form.user_id) : null,
    employee_id: form.employee_id ? Number(form.employee_id) : null,
    default_vehicle_id: form.default_vehicle_id ? Number(form.default_vehicle_id) : null,
    default_route_id: form.default_route_id ? Number(form.default_route_id) : null,
  };
}

export function buildVehicleBody(form, branchId) {
  const maxWeight = form.max_weight_kg === "" ? null : Number(form.max_weight_kg);
  const maxVolume = form.max_volume_m3 === "" ? null : Number(form.max_volume_m3);
  return {
    branch_id: branchId,
    vehicle_code: form.vehicle_code.trim(),
    vehicle_name: form.vehicle_name.trim(),
    plate_number: form.plate_number.trim() || null,
    max_weight_kg: Number.isFinite(maxWeight) ? maxWeight : null,
    max_volume_m3: Number.isFinite(maxVolume) ? maxVolume : null,
    is_active: form.is_active,
  };
}

export function suggestDriverCode(name) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
  }
  const base = String(name ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 6);
  return base || `DRV-${Date.now().toString(36).toUpperCase()}`;
}

export function suggestVehicleCode(plate) {
  const base = String(plate ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .slice(0, 12);
  return base || `VEH-${Date.now().toString(36).toUpperCase()}`;
}

function coerceId(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function getSaleDriverId(sale) {
  const meta = sale?.fulfillment_meta;
  if (!meta || typeof meta !== "object") return null;
  return coerceId(meta.driver_id ?? meta.driver?.id);
}

export function getSaleVehicleId(sale) {
  const meta = sale?.fulfillment_meta;
  if (!meta || typeof meta !== "object") return null;
  return coerceId(meta.vehicle_id ?? meta.vehicle?.id);
}

export function isDeliverySale(sale) {
  if (getSaleDriverId(sale) != null) return true;
  if (getSaleVehicleId(sale) != null) return true;
  if (sale?.route_id != null) return true;
  return sale?.channel === "mobile";
}

export function salesForDriver(sales, driverId) {
  return sales.filter((s) => Number(getSaleDriverId(s)) === Number(driverId));
}

export function salesForVehicle(sales, vehicleId) {
  return sales.filter((s) => Number(getSaleVehicleId(s)) === Number(vehicleId));
}

export function countDeliveriesByDriver(sales, period = "day") {
  const map = new Map();
  const ref = new Date();
  for (const sale of sales) {
    if (sale.deleted_at || sale.status === "cancelled" || sale.status === "expired") continue;
    const ts = getSaleTimestamp(sale);
    if (!ts) continue;
    if (period === "day" && !isSameCalendarDay(ts, ref)) continue;
    if (period === "month" && !isSameCalendarMonth(ts, ref)) continue;
    const driverId = getSaleDriverId(sale);
    if (driverId == null) continue;
    map.set(driverId, (map.get(driverId) ?? 0) + 1);
  }
  return map;
}

export function todayDeliveryStats(sales) {
  const ref = new Date();
  let completed = 0;
  let pending = 0;
  for (const sale of sales) {
    if (sale.deleted_at || !isDeliverySale(sale)) continue;
    const ts = getSaleTimestamp(sale);
    if (!ts || !isSameCalendarDay(ts, ref)) continue;
    if (sale.status === "completed" || sale.status === "delivered") completed += 1;
    else if (["pending", "booked", "unpaid", "processed", "pending_payment", "paid"].includes(sale.status)) {
      pending += 1;
    }
  }
  return { completed, pending };
}

export function deliveryStatsFromSales(sales) {
  return {
    completed: sales.filter((s) => (s.status === "completed" || s.status === "delivered") && !s.deleted_at).length,
    pending: sales.filter(
      (s) =>
        !s.deleted_at &&
        ["pending", "booked", "unpaid", "processed", "pending_payment", "paid"].includes(s.status),
    ).length,
    cancelled: sales.filter((s) => s.status === "cancelled").length,
  };
}

export function driverDeliveryStats(sales, driverId) {
  const list = salesForDriver(sales, driverId);
  return {
    completed: list.filter((s) => (s.status === "completed" || s.status === "delivered") && !s.deleted_at).length,
    pending: list.filter(
      (s) =>
        !s.deleted_at &&
        ["pending", "booked", "unpaid", "processed", "pending_payment", "paid"].includes(s.status),
    ).length,
    cancelled: list.filter((s) => s.status === "cancelled").length,
  };
}

export function vehicleRecentTrips(sales, vehicleId, limit = 8) {
  return salesForVehicle(sales, vehicleId)
    .filter((s) => !s.deleted_at && s.status === "completed")
    .sort((a, b) => (getSaleTimestamp(b)?.getTime() ?? 0) - (getSaleTimestamp(a)?.getTime() ?? 0))
    .slice(0, limit);
}

export function DriverStatusBadge({ active, onLeave = false }) {
  if (onLeave) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        On leave
      </span>
    );
  }
  if (active !== false) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#EAF3DE] px-2.5 py-0.5 text-[11px] font-medium text-[#27500A]">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      Inactive
    </span>
  );
}

export function VehicleStatusBadge({ active, maintenance = false }) {
  if (maintenance) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-0.5 text-[11px] font-medium text-orange-800">
        <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
        Maintenance
      </span>
    );
  }
  if (active !== false) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#EAF3DE] px-2.5 py-0.5 text-[11px] font-medium text-[#27500A]">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-medium text-red-800">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      Inactive
    </span>
  );
}

export function vehicleEmoji(name) {
  const n = String(name ?? "").toLowerCase();
  if (n.includes("hiace") || n.includes("van")) return "🚐";
  if (n.includes("fuso") || n.includes("fighter") || n.includes("truck")) return "🚛";
  return "🚚";
}

export function driverInitials(name) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
