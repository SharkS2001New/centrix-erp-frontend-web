import { shiftISO, todayISO, uid } from "@/lib/spa/format";

export const SPA_STORAGE_KEY = "centrix-spa-kinyozi-v1";

export function createSeed() {
  const clients = [
    { id: "c1", name: "Achieng Otieno", phone: "0712 345 678", email: "achieng@email.com", status: "VIP", loyalty: 480, notes: "Prefers a quiet treatment room.", visits: 12, spent: 48600 },
    { id: "c2", name: "Brian Kiprop", phone: "0722 118 904", email: "brian.kiprop@email.com", status: "Active", loyalty: 120, notes: "", visits: 4, spent: 6400 },
    { id: "c3", name: "Fatma Noor", phone: "0700 552 331", email: "fatma.noor@email.com", status: "Active", loyalty: 210, notes: "Allergic to strong fragrance.", visits: 7, spent: 18200 },
    { id: "c4", name: "Daniel Kimani", phone: "0744 220 118", email: "daniel.k@email.com", status: "Active", loyalty: 60, notes: "", visits: 3, spent: 2100 },
    { id: "c5", name: "Grace Wanjiru", phone: "0790 441 220", email: "grace.w@email.com", status: "New", loyalty: 20, notes: "", visits: 1, spent: 1800 },
  ];

  const staff = [
    { id: "s1", name: "Mary Wanjiku", role: "Senior stylist", phone: "0711 200 100", color: "#DBEAFE", commission: 15, active: true, days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] },
    { id: "s2", name: "John Kamau", role: "Barber", phone: "0722 300 200", color: "#D1FAE5", commission: 12, active: true, days: ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
    { id: "s3", name: "Amina Hassan", role: "Therapist", phone: "0733 400 300", color: "#FCE7F3", commission: 18, active: true, days: ["Mon", "Wed", "Thu", "Fri", "Sat"] },
    { id: "s4", name: "Peter Mwangi", role: "Barber", phone: "0745 500 400", color: "#FEF3C7", commission: 10, active: true, days: ["Mon", "Tue", "Thu", "Fri", "Sat"] },
  ];

  const services = [
    { id: "sv1", name: "Haircut", category: "Haircut", price: 500, duration: 30, staffIds: ["s1", "s2", "s4"], commission: 10, active: true, combo: false },
    { id: "sv2", name: "Beard trim", category: "Beard Trim", price: 300, duration: 20, staffIds: ["s2", "s4"], commission: 10, active: true, combo: false },
    { id: "sv3", name: "Hair coloring", category: "Hair Coloring", price: 2500, duration: 90, staffIds: ["s1"], commission: 12, active: true, combo: false },
    { id: "sv4", name: "Facial treatment", category: "Facial Treatment", price: 1800, duration: 60, staffIds: ["s3"], commission: 15, active: true, combo: false },
    { id: "sv5", name: "Relaxation massage", category: "Massage", price: 3500, duration: 60, staffIds: ["s3"], commission: 15, active: true, combo: false },
    { id: "sv6", name: "Manicure", category: "Manicure", price: 1200, duration: 45, staffIds: ["s1", "s3"], commission: 12, active: true, combo: false },
    { id: "sv7", name: "Pedicure", category: "Pedicure", price: 1500, duration: 50, staffIds: ["s1", "s3"], commission: 12, active: true, combo: false },
    { id: "sv8", name: "Cut & beard combo", category: "Haircut", price: 700, duration: 45, staffIds: ["s2", "s4"], commission: 10, active: true, combo: true },
  ];

  const rooms = [
    { id: "r1", name: "Treatment room 1", kind: "Facial" },
    { id: "r2", name: "Treatment room 2", kind: "Massage" },
  ];
  const chairs = [
    { id: "ch1", name: "Chair 1" },
    { id: "ch2", name: "Chair 2" },
    { id: "ch3", name: "Chair 3" },
  ];

  const suppliers = [
    { id: "sup1", name: "Nairobi Beauty Supplies", phone: "0701 888 221", email: "orders@nairobeauty.co.ke", category: "Salon retail" },
    { id: "sup2", name: "Rift Valley Linens", phone: "0710 222 904", email: "hello@riftlinens.co.ke", category: "Consumables" },
  ];

  const products = [
    { id: "p1", sku: "SH-001", name: "Moisturising shampoo", category: "Hair care", supplierId: "sup1", cost: 450, price: 850, qty: 6, reorder: 8 },
    { id: "p2", sku: "BO-014", name: "Beard oil", category: "Beard", supplierId: "sup1", cost: 300, price: 650, qty: 18, reorder: 6 },
    { id: "p3", sku: "DY-220", name: "Hair dye — black", category: "Color", supplierId: "sup1", cost: 700, price: 1400, qty: 3, reorder: 5 },
    { id: "p4", sku: "TW-010", name: "Salon towel", category: "Consumables", supplierId: "sup2", cost: 180, price: 0, qty: 40, reorder: 15 },
  ];

  const appointments = [
    { id: "a1", clientId: "c1", staffId: "s1", serviceId: "sv1", roomId: "", chairId: "ch1", start: shiftISO(0, "09:00"), duration: 30, status: "completed", notes: "" },
    { id: "a2", clientId: "c2", staffId: "s2", serviceId: "sv8", roomId: "", chairId: "ch2", start: shiftISO(0, "10:00"), duration: 45, status: "in_progress", notes: "Walk-in converted" },
    { id: "a3", clientId: "c3", staffId: "s3", serviceId: "sv4", roomId: "r1", chairId: "", start: shiftISO(0, "11:00"), duration: 60, status: "booked", notes: "" },
    { id: "a4", clientId: "c4", staffId: "s2", serviceId: "sv2", roomId: "", chairId: "ch1", start: shiftISO(0, "14:00"), duration: 20, status: "booked", notes: "" },
    { id: "a5", clientId: "c5", staffId: "s3", serviceId: "sv5", roomId: "r2", chairId: "", start: shiftISO(1, "10:30"), duration: 60, status: "booked", notes: "" },
    { id: "a6", clientId: "c1", staffId: "s1", serviceId: "sv3", roomId: "", chairId: "", start: shiftISO(-1, "15:00"), duration: 90, status: "completed", notes: "" },
  ];

  const sales = [0, 1, 2, 3, 4, 5, 6].map((offset, index) => ({
    id: `sale-${index + 1}`,
    number: `S-${1040 + index}`,
    at: shiftISO(-6 + offset, index % 2 === 0 ? "11:20" : "16:05"),
    clientId: clients[index % clients.length].id,
    staffId: staff[index % staff.length].id,
    lines: [
      { name: services[index % services.length].name, qty: 1, price: services[index % services.length].price, cost: 0, kind: "service", refId: services[index % services.length].id, staffId: staff[index % staff.length].id },
    ],
    discount: 0,
    taxRate: 0,
    tax: 0,
    total: services[index % services.length].price,
    payment: { method: ["cash", "mpesa", "card"][index % 3], parts: [{ method: ["cash", "mpesa", "card"][index % 3], amount: services[index % services.length].price }] },
    status: "completed",
  }));

  sales.push({
    id: "sale-today",
    number: "S-1102",
    at: shiftISO(0, "09:20"),
    clientId: "c1",
    staffId: "s1",
    lines: [
      { name: "Haircut", qty: 1, price: 500, cost: 0, kind: "service", refId: "sv1", staffId: "s1" },
      { name: "Beard oil", qty: 1, price: 650, cost: 300, kind: "product", refId: "p2", staffId: "s1" },
    ],
    discount: 0,
    taxRate: 0,
    tax: 0,
    total: 1150,
    payment: { method: "mpesa", parts: [{ method: "mpesa", amount: 1150 }] },
    status: "completed",
  });

  return {
    businessType: null,
    branch: "Westlands",
    branches: ["Westlands", "Kilimani"],
    profile: {
      name: "Centrix SPA & Kinyozi",
      phone: "0711 000 220",
      email: "westlands@centrixspa.co.ke",
      address: "Mpaka Road, Westlands, Nairobi",
      pin: "P051234567K",
    },
    hours: { open: "08:00", close: "19:00", days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] },
    taxRate: 0,
    payments: { cash: true, mpesa: true, card: true },
    receipt: { footer: "Thank you for choosing Centrix. Karibu tena.", showPin: true },
    users: [
      { id: "u1", name: "Stephen Otieno", email: "stephen@centrixspa.co.ke", role: "Owner", active: true },
      { id: "u2", name: "Mary Wanjiku", email: "mary@centrixspa.co.ke", role: "Stylist", active: true },
    ],
    roles: [
      { id: "owner", name: "Owner", permissions: ["All modules"] },
      { id: "stylist", name: "Stylist", permissions: ["Appointments", "POS / Sales", "Clients"] },
      { id: "cashier", name: "Cashier", permissions: ["POS / Sales", "Expenses"] },
    ],
    clients,
    staff,
    services,
    rooms,
    chairs,
    suppliers,
    products,
    movements: [
      { id: "m1", productId: "p1", type: "in", qty: 12, note: "Opening stock", at: shiftISO(-10, "09:00"), supplierId: "sup1" },
    ],
    appointments,
    walkIns: [
      { id: "w1", name: "Kevin Oduor", phone: "0708 111 222", serviceId: "sv1", at: shiftISO(0, "10:40"), status: "waiting" },
    ],
    sales,
    holds: [],
    expenses: [
      { id: "e1", category: "Rent", amount: 45000, method: "Bank", date: todayISO(), reference: "RENT-OCT", notes: "Westlands shop", status: "approved" },
      { id: "e2", category: "Utilities", amount: 6200, method: "M-Pesa", date: todayISO(), reference: "KPLC-441", notes: "", status: "pending" },
    ],
    packages: [
      { id: "pk1", clientId: "c1", name: "Glow facial x4", remaining: 3, total: 4 },
    ],
    memberships: [
      { id: "mb1", clientId: "c1", name: "Spa member", expires: shiftISO(60, "00:00").slice(0, 10) },
    ],
    clientNotes: [
      { id: "n1", clientId: "c1", text: "Likes a short fade and a quiet room.", at: shiftISO(-2, "12:00") },
    ],
    attendance: staff.map((person) => ({ id: uid("att"), staffId: person.id, date: todayISO(), status: "present" })),
    nextSale: 1103,
  };
}
