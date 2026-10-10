import { SPA_STORAGE_KEY } from "@/lib/spa/seed";

function readSpaState() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SPA_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Topbar search over the salon records stored in this browser. */
export function searchSpaRecords(kind, query, limit = 5) {
  const state = readSpaState();
  const q = String(query ?? "").trim().toLowerCase();
  if (!state || q.length < 2) return [];

  if (kind === "clients") {
    return (state.clients ?? [])
      .filter((row) => `${row.name ?? ""} ${row.phone ?? ""}`.toLowerCase().includes(q))
      .slice(0, limit)
      .map((row) => ({
        id: `client:${row.id}`,
        label: String(row.name ?? "Client"),
        subtitle: row.phone ? String(row.phone) : undefined,
        href: `/spa/clients/${row.id}`,
      }));
  }

  if (kind === "services") {
    return (state.services ?? [])
      .filter((row) => String(row.name ?? "").toLowerCase().includes(q))
      .slice(0, limit)
      .map((row) => ({
        id: `service:${row.id}`,
        label: String(row.name ?? "Service"),
        subtitle: row.category ? String(row.category) : undefined,
        href: "/spa/services",
      }));
  }

  if (kind === "products") {
    return (state.products ?? [])
      .filter((row) => `${row.name ?? ""} ${row.sku ?? ""}`.toLowerCase().includes(q))
      .slice(0, limit)
      .map((row) => ({
        id: `product:${row.id}`,
        label: String(row.name ?? "Product"),
        subtitle: row.sku ? String(row.sku) : undefined,
        href: "/spa/inventory",
      }));
  }

  return [];
}
