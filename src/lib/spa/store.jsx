"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getStoredOrganization } from "@/lib/auth-storage";
import { datePart, resolveSpaFeatures, stockStatus, todayISO, uid } from "@/lib/spa/format";
import { importRemoteServicePhoto, isPublicImageUrl, servicePhoto } from "@/lib/spa/image";
import { SPA_STORAGE_KEY, createSeed, spaStorageKeyForOrg } from "@/lib/spa/seed";

const SpaContext = createContext(null);
const PERSIST_DEBOUNCE_MS = 280;

function resolveStorageKey() {
  return spaStorageKeyForOrg(getStoredOrganization()?.id);
}

/** Drop heavy data-URL photos from the persisted snapshot so saves stay fast. */
function leanPersistState(state) {
  return {
    ...state,
    services: (state.services || []).map((service) => {
      const image = String(service.image || "");
      if (image.startsWith("data:")) {
        const { image: _drop, ...rest } = service;
        return rest;
      }
      return service;
    }),
  };
}

function loadState() {
  if (typeof window === "undefined") return createSeed();
  try {
    const key = resolveStorageKey();
    let raw = window.localStorage.getItem(key);
    if (!raw && key !== SPA_STORAGE_KEY) {
      raw = window.localStorage.getItem(SPA_STORAGE_KEY);
      if (raw) {
        window.localStorage.setItem(key, raw);
      }
    }
    if (!raw) return createSeed();
    const parsed = JSON.parse(raw);
    return { ...createSeed(), ...parsed, businessType: parsed.businessType ?? null };
  } catch {
    return createSeed();
  }
}

export function SpaProvider({ children }) {
  const [state, setState] = useState(createSeed);
  const [ready, setReady] = useState(false);
  const photoAttempts = useRef(new Set());
  const persistTimer = useRef(null);

  useEffect(() => {
    setState(loadState());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(resolveStorageKey(), JSON.stringify(leanPersistState(state)));
      } catch {
        /* A photo that does not fit stays in this session only. */
      }
    }, PERSIST_DEBOUNCE_MS);
    return () => window.clearTimeout(persistTimer.current);
  }, [ready, state]);

  useEffect(() => {
    if (!ready) return undefined;
    const pending = state.services.filter((item) => {
      const url = String(item.imageUrl || "").trim();
      return isPublicImageUrl(url) && item.imageFromUrl !== url && !photoAttempts.current.has(`${item.id}:${url}`);
    });
    if (pending.length === 0) return undefined;
    let cancelled = false;
    pending.forEach((service) => {
      const url = String(service.imageUrl).trim();
      photoAttempts.current.add(`${service.id}:${url}`);
      importRemoteServicePhoto(url)
        .then((image) => {
          if (cancelled) return;
          setState((current) => ({
            ...current,
            services: current.services.map((row) =>
              row.id === service.id && String(row.imageUrl || "").trim() === url
                ? { ...row, image, imageFromUrl: url }
                : row,
            ),
          }));
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
      pending.forEach((service) => {
        photoAttempts.current.delete(`${service.id}:${String(service.imageUrl).trim()}`);
      });
    };
  }, [ready, state.services]);

  const api = useMemo(() => {
    function patch(partial) {
      setState((current) => ({ ...current, ...partial }));
    }

    return {
      ...state,
      ready,
      features: resolveSpaFeatures(state.businessType, state.featureOverrides),
      resetDemo() {
        const next = createSeed();
        next.businessType = state.businessType || "combined";
        setState(next);
      },
      setBusinessType(businessType) {
        patch({ businessType, featureOverrides: {} });
      },
      saveFeatures(featureOverrides) {
        patch({ featureOverrides });
      },
      setBranch(branch) {
        patch({ branch });
      },
      saveProfile(profile) {
        if (!profile.name?.trim()) return "Enter the business name.";
        patch({ profile: { ...state.profile, ...profile } });
        return null;
      },
      saveHours(hours) {
        patch({ hours });
        return null;
      },
      saveTax(taxRate) {
        patch({ taxRate: Math.min(100, Math.max(0, Number(taxRate) || 0)) });
      },
      savePayments(payments) {
        patch({ payments });
      },
      saveReceipt(receipt) {
        patch({ receipt: { ...state.receipt, ...receipt } });
      },
      addBranch(name) {
        const clean = name.trim();
        if (!clean) return "Enter a branch name.";
        if (state.branches.includes(clean)) return "That branch already exists.";
        patch({ branches: [...state.branches, clean] });
        return null;
      },
      saveUser(user) {
        if (!user.name?.trim() || !user.email?.trim()) return "Name and email are required.";
        const next = user.id
          ? state.users.map((row) => (row.id === user.id ? { ...row, ...user } : row))
          : [...state.users, { ...user, id: uid("u"), active: true }];
        patch({ users: next });
        return null;
      },
      saveClient(client) {
        if (!client.name?.trim() || !client.phone?.trim()) return "Name and phone are required.";
        if (client.id) {
          patch({ clients: state.clients.map((row) => (row.id === client.id ? { ...row, ...client } : row)) });
        } else {
          patch({
            clients: [...state.clients, { ...client, id: uid("c"), loyalty: 0, visits: 0, spent: 0, status: client.status || "New", notes: client.notes || "" }],
          });
        }
        return null;
      },
      addClientNote(clientId, text) {
        if (!text.trim()) return "Write a note first.";
        patch({ clientNotes: [{ id: uid("n"), clientId, text: text.trim(), at: new Date().toISOString() }, ...state.clientNotes] });
        return null;
      },
      saveService(service) {
        if (!service.name?.trim()) return "Enter a service name.";
        if (Number(service.price) < 0 || Number(service.duration) <= 0) return "Price and duration need valid numbers.";
        const imageUrl = isPublicImageUrl(service.imageUrl) ? String(service.imageUrl).trim() : "";
        const previous = service.id ? state.services.find((item) => item.id === service.id) : null;
        const keptDownload = imageUrl && previous?.imageFromUrl === imageUrl ? servicePhoto(previous.image) : "";
        const row = {
          ...service,
          price: Number(service.price) || 0,
          duration: Number(service.duration) || 30,
          commission: Number(service.commission) || 0,
          staffIds: service.staffIds || [],
          active: service.active !== false,
          combo: Boolean(service.combo),
          imageUrl,
          imageFromUrl: keptDownload ? imageUrl : "",
          image: imageUrl ? keptDownload : servicePhoto(service.image),
        };
        patch({
          services: service.id
            ? state.services.map((item) => (item.id === service.id ? { ...item, ...row } : item))
            : [...state.services, { ...row, id: uid("sv") }],
        });
        return null;
      },
      saveStaff(person) {
        if (!person.name?.trim()) return "Enter the staff name.";
        const row = { ...person, commission: Number(person.commission) || 0, active: person.active !== false, days: person.days || [] };
        patch({
          staff: person.id
            ? state.staff.map((item) => (item.id === person.id ? { ...item, ...row } : item))
            : [...state.staff, { ...row, id: uid("s"), color: "#DBEAFE" }],
        });
        return null;
      },
      saveRoom(room) {
        const name = String(room.name || "").trim();
        if (!name) return "Enter the room name.";
        if (state.rooms.some((item) => item.id !== room.id && item.name.toLowerCase() === name.toLowerCase())) {
          return "A room with that name already exists.";
        }
        const row = { ...room, name, kind: String(room.kind || "").trim() };
        patch({
          rooms: room.id
            ? state.rooms.map((item) => (item.id === room.id ? { ...item, ...row } : item))
            : [...state.rooms, { ...row, id: uid("r") }],
        });
        return null;
      },
      removeRoom(id) {
        setState((current) => ({
          ...current,
          rooms: current.rooms.filter((item) => item.id !== id),
          appointments: current.appointments.map((item) =>
            item.roomId === id ? { ...item, roomId: "" } : item,
          ),
        }));
      },
      saveChair(chair) {
        const name = String(chair.name || "").trim();
        if (!name) return "Enter the chair name.";
        if (state.chairs.some((item) => item.id !== chair.id && item.name.toLowerCase() === name.toLowerCase())) {
          return "A chair with that name already exists.";
        }
        const row = { ...chair, name };
        patch({
          chairs: chair.id
            ? state.chairs.map((item) => (item.id === chair.id ? { ...item, ...row } : item))
            : [...state.chairs, { ...row, id: uid("ch") }],
        });
        return null;
      },
      removeChair(id) {
        setState((current) => ({
          ...current,
          chairs: current.chairs.filter((item) => item.id !== id),
          appointments: current.appointments.map((item) =>
            item.chairId === id ? { ...item, chairId: "" } : item,
          ),
        }));
      },
      saveMembership(membership) {
        if (!membership.clientId) return "Choose a client.";
        if (!membership.name?.trim()) return "Enter the membership name.";
        if (!membership.expires) return "Choose an expiry date.";
        const row = { ...membership, name: membership.name.trim() };
        patch({
          memberships: membership.id
            ? state.memberships.map((item) => (item.id === membership.id ? { ...item, ...row } : item))
            : [...state.memberships, { ...row, id: uid("mb") }],
        });
        return null;
      },
      removeMembership(id) {
        patch({ memberships: state.memberships.filter((item) => item.id !== id) });
      },
      savePackage(item) {
        if (!item.clientId) return "Choose a client.";
        if (!item.name?.trim()) return "Enter the package name.";
        const total = Number(item.total);
        if (!Number.isInteger(total) || total < 1) return "Enter at least one session.";
        const row = { ...item, name: item.name.trim(), total, remaining: total };
        patch({
          packages: item.id
            ? state.packages.map((current) => (current.id === item.id ? { ...current, ...row } : current))
            : [...state.packages, { ...row, id: uid("pk") }],
        });
        return null;
      },
      usePackage(id) {
        const item = state.packages.find((current) => current.id === id);
        if (!item || Number(item.remaining) < 1) return "No sessions remain in this package.";
        patch({
          packages: state.packages.map((current) =>
            current.id === id ? { ...current, remaining: current.remaining - 1 } : current,
          ),
        });
        return null;
      },
      setAttendance(staffId, status) {
        const date = todayISO();
        const existing = state.attendance.find((row) => row.staffId === staffId && row.date === date);
        patch({
          attendance: existing
            ? state.attendance.map((row) => (row.id === existing.id ? { ...row, status } : row))
            : [...state.attendance, { id: uid("att"), staffId, date, status }],
        });
      },
      saveAppointment(draft) {
        if (!draft.clientId) return "Choose a client.";
        if (!draft.staffId) return "Assign a staff member.";
        if (!draft.serviceId) return "Choose a service.";
        if (!draft.start) return "Choose a date and time.";
        const service = state.services.find((item) => item.id === draft.serviceId);
        const row = {
          id: draft.id || uid("a"),
          clientId: draft.clientId,
          staffId: draft.staffId,
          serviceId: draft.serviceId,
          roomId: draft.roomId || "",
          chairId: draft.chairId || "",
          start: draft.start,
          duration: Number(draft.duration) || service?.duration || 30,
          status: draft.status || "booked",
          notes: draft.notes || "",
        };
        patch({
          appointments: draft.id
            ? state.appointments.map((item) => (item.id === draft.id ? row : item))
            : [...state.appointments, row],
        });
        return null;
      },
      setAppointmentStatus(id, status) {
        patch({ appointments: state.appointments.map((item) => (item.id === id ? { ...item, status } : item)) });
      },
      addWalkIn(draft) {
        if (!draft.name?.trim()) return "Enter the guest name.";
        patch({
          walkIns: [...state.walkIns, { id: uid("w"), name: draft.name.trim(), phone: draft.phone || "", serviceId: draft.serviceId || "", at: new Date().toISOString(), status: "waiting" }],
        });
        return null;
      },
      seatWalkIn(id, staffId, chairId) {
        const guest = state.walkIns.find((item) => item.id === id);
        if (!guest) return "That walk-in is no longer in the queue.";
        if (!staffId) return "Assign a barber or therapist.";
        const service = state.services.find((item) => item.id === guest.serviceId) || state.services[0];
        const start = new Date();
        const stamp = `${todayISO(start)}T${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}:00`;
        setState((current) => {
          const matched = current.clients.find((item) => guest.phone && item.phone === guest.phone);
          const client = matched || {
            id: uid("c"),
            name: guest.name,
            phone: guest.phone,
            email: "",
            status: "New",
            loyalty: 0,
            notes: "",
            visits: 0,
            spent: 0,
          };
          return {
            ...current,
            clients: matched ? current.clients : [...current.clients, client],
            walkIns: current.walkIns.map((item) => (item.id === id ? { ...item, status: "seated" } : item)),
            appointments: [
              ...current.appointments,
              {
                id: uid("a"),
                clientId: client.id,
                staffId,
                serviceId: service?.id || "",
                roomId: "",
                chairId: chairId || "",
                start: stamp,
                duration: service?.duration || 30,
                status: "in_progress",
                notes: "Seated from the walk-in queue",
              },
            ],
          };
        });
        return null;
      },
      saveProduct(product) {
        if (!product.name?.trim() || !product.sku?.trim()) return "SKU and product name are required.";
        const row = {
          ...product,
          cost: Number(product.cost) || 0,
          price: Number(product.price) || 0,
          qty: Number(product.qty) || 0,
          reorder: Number(product.reorder) || 0,
        };
        patch({
          products: product.id
            ? state.products.map((item) => (item.id === product.id ? { ...item, ...row } : item))
            : [...state.products, { ...row, id: uid("p") }],
        });
        return null;
      },
      stockIn(productId, qty, supplierId, note) {
        const amount = Number(qty);
        if (!productId || amount <= 0) return "Choose a product and a quantity above zero.";
        patch({
          products: state.products.map((item) => (item.id === productId ? { ...item, qty: item.qty + amount, supplierId: supplierId || item.supplierId } : item)),
          movements: [{ id: uid("m"), productId, type: "in", qty: amount, note: note || "Stock in", at: new Date().toISOString(), supplierId: supplierId || "" }, ...state.movements],
        });
        return null;
      },
      adjustStock(productId, qty, note) {
        const amount = Number(qty);
        if (!productId || Number.isNaN(amount) || amount === 0) return "Enter a non-zero adjustment.";
        const product = state.products.find((item) => item.id === productId);
        if (!product || product.qty + amount < 0) return "Stock cannot go below zero.";
        patch({
          products: state.products.map((item) => (item.id === productId ? { ...item, qty: item.qty + amount } : item)),
          movements: [{ id: uid("m"), productId, type: "adjust", qty: amount, note: note || "Adjustment", at: new Date().toISOString(), supplierId: "" }, ...state.movements],
        });
        return null;
      },
      saveSupplier(supplier) {
        if (!supplier.name?.trim()) return "Enter the supplier name.";
        patch({
          suppliers: supplier.id
            ? state.suppliers.map((item) => (item.id === supplier.id ? { ...item, ...supplier } : item))
            : [...state.suppliers, { ...supplier, id: uid("sup") }],
        });
        return null;
      },
      saveExpense(expense) {
        if (!expense.category?.trim() || Number(expense.amount) <= 0) return "Category and amount are required.";
        if (!expense.date) return "Choose a date.";
        const row = { ...expense, amount: Number(expense.amount), status: expense.status || "pending" };
        patch({
          expenses: expense.id
            ? state.expenses.map((item) => (item.id === expense.id ? { ...item, ...row } : item))
            : [...state.expenses, { ...row, id: uid("e") }],
        });
        return null;
      },
      setExpenseStatus(id, status) {
        patch({ expenses: state.expenses.map((item) => (item.id === id ? { ...item, status } : item)) });
      },
      holdSale(sale) {
        patch({ holds: [...state.holds, { ...sale, id: uid("hold"), status: "held", at: new Date().toISOString() }] });
      },
      removeHold(id) {
        patch({ holds: state.holds.filter((item) => item.id !== id) });
      },
      completeSale(sale) {
        const lines = sale.lines || [];
        if (lines.length === 0) return "Add a service or product first.";
        const total = Number(sale.total) || 0;
        const paid = (sale.payment?.parts || []).reduce((sum, part) => sum + (Number(part.amount) || 0), 0);
        if (Math.round(paid) !== Math.round(total)) return "The payment amounts must equal the total. Nothing has been charged.";
        const productUse = {};
        for (const line of lines) {
          if (line.kind !== "product") continue;
          productUse[line.refId] = (productUse[line.refId] || 0) + Number(line.qty || 0);
        }
        for (const [productId, qty] of Object.entries(productUse)) {
          const product = state.products.find((item) => item.id === productId);
          if (!product || product.qty < qty) return `${product?.name || "A product"} does not have enough stock.`;
        }
        const number = `S-${state.nextSale}`;
        const completed = { ...sale, id: uid("sale"), number, status: "completed", at: new Date().toISOString() };
        const products = state.products.map((item) => (productUse[item.id] ? { ...item, qty: item.qty - productUse[item.id] } : item));
        const movements = [
          ...Object.entries(productUse).map(([productId, qty]) => ({
            id: uid("m"),
            productId,
            type: "sale",
            qty: -qty,
            note: number,
            at: completed.at,
            supplierId: "",
          })),
          ...state.movements,
        ];
        const clients = state.clients.map((client) => {
          if (client.id !== sale.clientId) return client;
          return {
            ...client,
            visits: client.visits + 1,
            spent: client.spent + total,
            loyalty: client.loyalty + Math.floor(total / 100),
            status: client.status === "New" ? "Active" : client.status,
          };
        });
        const appointmentId = sale.appointmentId || "";
        setState((current) => ({
          ...current,
          sales: [completed, ...current.sales],
          holds: current.holds.filter((item) => item.id !== sale.holdId),
          products,
          movements,
          clients,
          appointments: appointmentId
            ? current.appointments.map((item) =>
                item.id === appointmentId ? { ...item, status: "completed" } : item,
              )
            : current.appointments,
          nextSale: current.nextSale + 1,
        }));
        return completed;
      },
      appointmentForCheckout(id) {
        return state.appointments.find((item) => item.id === id) || null;
      },
      lowStock() {
        return state.products.filter((item) => stockStatus(item) !== "In stock");
      },
      salesOn(iso) {
        return state.sales.filter((sale) => sale.status === "completed" && datePart(sale.at) === iso);
      },
    };
  }, [ready, state]);

  return <SpaContext.Provider value={api}>{children}</SpaContext.Provider>;
}

export function useSpa() {
  const value = useContext(SpaContext);
  if (!value) throw new Error("useSpa must be used inside SpaProvider");
  return value;
}
