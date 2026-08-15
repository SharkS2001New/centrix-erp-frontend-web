/** Product weight is kilograms per stock (base) unit. 1 tonne = 1000 kg. */

export function kgToTonnes(kg) {
  const n = Number(kg);
  if (!Number.isFinite(n) || n === 0) return 0;
  return n / 1000;
}

export function tonnesToKg(tonnes) {
  const n = Number(tonnes);
  if (!Number.isFinite(n)) return null;
  return n * 1000;
}

export function formatTonnage(kg, { empty = "—", digits = 3 } = {}) {
  const n = Number(kg);
  if (!Number.isFinite(n) || n <= 0) return empty;
  const tonnes = kgToTonnes(n);
  return `${tonnes.toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })} t`;
}

export function formatKgWeight(kg, { empty = "—" } = {}) {
  const n = Number(kg);
  if (!Number.isFinite(n) || n <= 0) return empty;
  const text =
    n % 1 === 0
      ? String(Math.trunc(n))
      : n.toLocaleString("en-KE", { maximumFractionDigits: 3 });
  return `${text} kg`;
}

export function pickingLineWeightKg(line) {
  const explicit = Number(line?.line_weight_kg);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const unit = Number(line?.product_weight);
  const qty = Number(line?.required_qty ?? line?.quantity ?? 0);
  if (Number.isFinite(unit) && unit > 0 && Number.isFinite(qty)) {
    return unit * qty;
  }
  return 0;
}

export function summarizePickingTonnage(pickingList, lines = pickingList?.lines) {
  const listedKg = Number(pickingList?.total_weight_kg);
  const totalKg = Number.isFinite(listedKg)
    ? listedKg
    : (lines ?? []).reduce((sum, line) => sum + pickingLineWeightKg(line), 0);
  const missing =
    Number(pickingList?.missing_weight_count) ||
    (lines ?? []).filter((line) => line?.weight_missing).length;
  const vehicleMaxKg =
    Number(pickingList?.vehicle_max_weight_kg) ||
    Number(pickingList?.vehicle?.max_weight_kg) ||
    0;

  return {
    totalKg,
    totalTonnes: kgToTonnes(totalKg),
    missingCount: missing,
    vehicleMaxKg: vehicleMaxKg > 0 ? vehicleMaxKg : null,
    vehicleMaxTonnes: vehicleMaxKg > 0 ? kgToTonnes(vehicleMaxKg) : null,
    overCapacity: vehicleMaxKg > 0 && totalKg > vehicleMaxKg + 0.0001,
  };
}

export function loadTonnageFromDocuments({ pickingList, loadingList, trip } = {}) {
  const source = pickingList ?? loadingList ?? {};
  const summary = summarizePickingTonnage(source);
  const vehicleMaxKg =
    summary.vehicleMaxKg ||
    Number(loadingList?.vehicle_max_weight_kg) ||
    Number(trip?.vehicle?.max_weight_kg) ||
    Number(loadingList?.vehicle?.max_weight_kg) ||
    Number(pickingList?.vehicle?.max_weight_kg) ||
    0;

  return {
    ...summary,
    vehicleMaxKg: vehicleMaxKg > 0 ? vehicleMaxKg : null,
    vehicleMaxTonnes: vehicleMaxKg > 0 ? kgToTonnes(vehicleMaxKg) : null,
    overCapacity: vehicleMaxKg > 0 && summary.totalKg > vehicleMaxKg + 0.0001,
  };
}
