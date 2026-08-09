"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SearchableSelect } from "@/components/catalog/searchable-select";
import { useAuth } from "@/contexts/auth-context";
import { useHotelPosOfflineSupport } from "@/hooks/use-hotel-pos-offline-support";
import { apiRequest, ApiError } from "@/lib/api";
import {
  addHotelCheckLine,
  addHotelCheckRoomStay,
  assignHotelCheckGuest,
  assignHotelCheckTable,
  clearHotelCheck,
  fetchHotelPosCatalog,
  fetchHotelPosSellableRooms,
  fetchHotelPosSettings,
  holdHotelCheck,
  listCollectibleHotelChecks,
  listHotelFloorTables,
  listOpenHotelFolios,
  openHotelCheck,
  removeHotelCheckLine,
  resumeHotelCheck,
  saveHotelCheck,
  settleHotelCheck,
  updateHotelCheckLineQty,
  voidHotelCheck,
} from "@/lib/hospitality-pos-api";
import {
  addProductToLocalHotelCheck,
  clearLocalHotelCheckLines,
  completeOfflineHotelCashCheck,
  isHotelLocalFirstCheckout,
  isLocalHotelCheckId,
  loadPersistedLocalHotelCheck,
  patchLocalHotelCheck,
  removeLocalHotelCheckLine,
  searchHotelPosOfflineCatalog,
  updateLocalHotelCheckLineQty,
} from "@/lib/hotel-pos-offline";
import { idbClearLocalCheck } from "@/lib/hotel-pos-offline-db";
import {
  formatHotelMoney,
  normalizeHotelPosGridColumns,
  resolveHotelPosPaymentConfig,
  resolveHotelPosSettings,
} from "@/lib/hotel-pos-settings";
import {
  hotelPosThemeCssVars,
  normalizeHotelPosThemeTemplate,
} from "@/lib/hotel-pos-theme-templates";
import { resolveHospitalityPaymentWorkflow } from "@/lib/hospitality-payment-workflow";
import { isHospitalityServiceEnabled } from "@/lib/hospitality-services";
import { notifyError, notifySuccess } from "@/lib/notify";
import { PRODUCT_NAME } from "@/lib/branding";
import { CentrixLogoHeader } from "@/components/branding/centrix-logo";
import { PosActionButton } from "@/components/sales/pos-action-button";
import { HotelPosPaymentPanel } from "@/components/hospitality/hotel-pos-payment-panel";
import { HotelPosProductImage } from "@/components/hospitality/hotel-pos-product-image";
import { HotelPosStatusFooter } from "@/components/hospitality/hotel-pos-status-footer";
import { printHospitalityCheckReceipt } from "@/components/hospitality/hospitality-check-receipt-print";
import {
  buildHospitalityCheckPrintOptions,
  normalizeHospitalityCheckPrintSettings,
} from "@/lib/hospitality-check-print-options";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { EntityPhotoDisplay, productPhotoFileUrl } from "@/components/media/entity-photo-display";
import { NotificationBell } from "@/components/layout/notification-bell";
import { UserAccountMenu } from "@/components/layout/user-account-menu";
import { disposePrintWindow, openBlankPrintWindow } from "@/lib/open-print-window";
import { shouldUsePrintAgentForDocument } from "@/lib/print-dispatch";
import {
  isPrintAgentEnabled,
  isPrintAgentRecentlyHealthy,
  warmPrintAgentHealth,
} from "@/lib/print-agent";

const MENU_FILTER_CHIPS = [
  { id: "", label: "All", short: "All" },
  { id: "food", label: "Food", short: "Food" },
  { id: "drinks", label: "Drinks", short: "Drinks" },
  { id: "rooms", label: "Rooms", short: "Rooms", requiresRooms: true },
];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function defaultCheckoutLocalValue(nights) {
  const d = new Date();
  d.setDate(d.getDate() + Math.max(1, Number(nights) || 1));
  d.setHours(10, 0, 0, 0);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function localDatetimeToIso(localValue) {
  if (!localValue) return null;
  const d = new Date(localValue);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
/**
 * Open a blank print window while still in the click gesture (before await settle/save).
 * Skip when Print Agent is warm — passing a window forces browser mode and skips the agent.
 */
function openHotelReceiptPrintWindow() {
  if (shouldUsePrintAgentForDocument("receipt") && isPrintAgentRecentlyHealthy()) {
    return null;
  }
  return openBlankPrintWindow("width=420,height=720");
}

async function printCheckReceiptSafe(
  check,
  { title, organization, capabilities, user, checkPrintSettings, printWindow = null } = {},
) {
  try {
    if (!check) {
      disposePrintWindow(printWindow);
      notifyError("Receipt could not be printed — order data was missing after payment.");
      return { ok: false };
    }
    const result = await printHospitalityCheckReceipt(check, {
      ...buildHospitalityCheckPrintOptions({
        checkPrintSettings,
        organization,
        capabilities,
        user,
        title,
      }),
      printWindow,
    });
    // Unused pre-opened window when agent handled the job.
    if (printWindow && result?.mode === "agent") {
      disposePrintWindow(printWindow);
    }
    if (!result || result.ok === false) {
      disposePrintWindow(printWindow);
      notifyError(
        result?.error ||
          "Receipt could not be printed. Start Centrix Print Agent (or allow the browser print dialog), then use Reprint.",
      );
    }
    return result;
  } catch (e) {
    disposePrintWindow(printWindow);
    notifyError(
      dedupeError(e) ||
        "Receipt print failed. Start Centrix Print Agent (or allow the browser print dialog), then use Reprint.",
    );
    return { ok: false };
  }
}

function dedupeError(e) {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}

export function HotelBarPosScreen() {
  const { capabilities, user, organization } = useAuth();
  const assignedOutletId =
    user?.hospitality_outlet_id ?? capabilities?.hospitality_outlet_id ?? null;
  const [menuOutlet, setMenuOutlet] = useState(null);
  const {
    status: connectionStatus,
    sellingLocked,
    offlineMode,
    pendingSync,
    failedSyncChecks,
    checkNumbersLeft,
    syncing: offlineSyncing,
    flushOutboxAfterSale,
    syncOfflineChecks,
  } = useHotelPosOfflineSupport({
    enabled: true,
    outletId: menuOutlet?.id ?? assignedOutletId ?? null,
  });
  const hotelSettings = resolveHotelPosSettings(capabilities);
  const paymentWorkflow = resolveHospitalityPaymentWorkflow(capabilities);
  const [gridColumns, setGridColumns] = useState(hotelSettings.gridColumns);
  const [collectPayment, setCollectPayment] = useState(hotelSettings.collectPayment);
  const [catalogLimit, setCatalogLimit] = useState(hotelSettings.catalogLimit);
  const [stockDeductOnSettle, setStockDeductOnSettle] = useState(hotelSettings.stockDeductOnSettle);
  const [themeTemplate, setThemeTemplate] = useState(hotelSettings.themeTemplate);
  const [checkPrintSettings, setCheckPrintSettings] = useState(null);
  const [guestNameEnabled, setGuestNameEnabled] = useState(false);
  const [guestNameDraft, setGuestNameDraft] = useState("");
  const [tablePosEnabled, setTablePosEnabled] = useState(
    isHospitalityServiceEnabled(capabilities, "table_pos"),
  );
  const [unpaidEnabled, setUnpaidEnabled] = useState(paymentWorkflow.unpaid);
  const [menuGroup, setMenuGroup] = useState("");
  const [chargeToRoom, setChargeToRoom] = useState(false);
  const [selectedFolioId, setSelectedFolioId] = useState("");
  const [heldCount, setHeldCount] = useState(0);
  const [lastReceiptCheck, setLastReceiptCheck] = useState(null);
  const [partialEnabled, setPartialEnabled] = useState(paymentWorkflow.partially_paid);
  const [floorTables, setFloorTables] = useState([]);
  const [selectedTableId, setSelectedTableId] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [products, setProducts] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogLoadingMore, setCatalogLoadingMore] = useState(false);
  const [catalogHasMore, setCatalogHasMore] = useState(false);
  const [catalogNextOffset, setCatalogNextOffset] = useState(null);
  const [searching, setSearching] = useState(false);
  const [check, setCheck] = useState(null);
  const [selectedLineId, setSelectedLineId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [queueChecks, setQueueChecks] = useState([]);
  const [payOpen, setPayOpen] = useState(false);
  const [payError, setPayError] = useState(null);
  const [roomChargeEnabled, setRoomChargeEnabled] = useState(
    isHospitalityServiceEnabled(capabilities, "room_charge") &&
      isHospitalityServiceEnabled(capabilities, "folios"),
  );
  const [openFolios, setOpenFolios] = useState([]);
  const [activePaymentMethods, setActivePaymentMethods] = useState([]);
  const [roomStayDraft, setRoomStayDraft] = useState(null);
  const searchRef = useRef(null);
  const tableSelectRef = useRef(null);
  const catalogScrollRef = useRef(null);
  const loadMoreSentinelRef = useRef(null);
  const catalogRequestIdRef = useRef(0);

  const showGuestField = guestNameEnabled;
  const showTableField = tablePosEnabled;
  const roomsServiceEnabled = isHospitalityServiceEnabled(capabilities, "rooms");
  const visibleMenuChips = useMemo(
    () => MENU_FILTER_CHIPS.filter((chip) => !chip.requiresRooms || roomsServiceEnabled),
    [roomsServiceEnabled],
  );

  const paymentConfig = useMemo(
    () =>
      resolveHotelPosPaymentConfig(capabilities?.module_settings, {
        capabilities,
        activePaymentMethods,
      }),
    [capabilities, activePaymentMethods],
  );

  useEffect(() => {
    let cancelled = false;
    apiRequest("/payment-methods", {
      searchParams: { per_page: 50, "filter[is_active]": 1 },
    })
      .then((res) => {
        if (!cancelled) setActivePaymentMethods(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setActivePaymentMethods([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setGridColumns(hotelSettings.gridColumns);
    setCollectPayment(hotelSettings.collectPayment);
    setCatalogLimit(hotelSettings.catalogLimit);
    setStockDeductOnSettle(hotelSettings.stockDeductOnSettle);
    setThemeTemplate(hotelSettings.themeTemplate);
    setTablePosEnabled(isHospitalityServiceEnabled(capabilities, "table_pos"));
    setRoomChargeEnabled(
      isHospitalityServiceEnabled(capabilities, "room_charge") &&
        isHospitalityServiceEnabled(capabilities, "folios"),
    );
    setUnpaidEnabled(paymentWorkflow.unpaid);
    setPartialEnabled(paymentWorkflow.partially_paid);
  }, [
    hotelSettings.gridColumns,
    hotelSettings.collectPayment,
    hotelSettings.catalogLimit,
    hotelSettings.stockDeductOnSettle,
    hotelSettings.themeTemplate,
    capabilities,
    paymentWorkflow.unpaid,
    paymentWorkflow.partially_paid,
  ]);

  useEffect(() => {
    if (!roomChargeEnabled) {
      setChargeToRoom(false);
      setSelectedFolioId("");
    }
  }, [roomChargeEnabled]);

  useEffect(() => {
    if (!sellingLocked) return;
    setPayOpen(false);
    setRoomStayDraft(null);
    setBusy(false);
  }, [sellingLocked]);

  useEffect(() => {
    if (!roomChargeEnabled || offlineMode) {
      setOpenFolios([]);
      return;
    }
    let cancelled = false;
    listOpenHotelFolios()
      .then((foliosRes) => {
        if (!cancelled) setOpenFolios(foliosRes?.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setOpenFolios([]);
      });
    return () => {
      cancelled = true;
    };
  }, [roomChargeEnabled, offlineMode]);

  function applySelectedFolio(folioId) {
    const id = String(folioId ?? "");
    setSelectedFolioId(id);
    if (!id) return;
    setChargeToRoom(true);
    const folio = openFolios.find((f) => String(f.id) === id);
    if (folio?.guest_name) {
      setGuestNameDraft(String(folio.guest_name));
    } else if (folio?.room_number) {
      setGuestNameDraft(`Rm ${folio.room_number}`);
    }
  }

  function resetRoomChargeSelection({ keepChargePreference = false } = {}) {
    setSelectedFolioId("");
    if (!keepChargePreference) {
      setChargeToRoom(false);
    }
  }

  function syncFolioFromCheck(nextCheck) {
    const folioId = nextCheck?.folio_id ?? nextCheck?.folio?.id;
    if (folioId) {
      setSelectedFolioId(String(folioId));
      setChargeToRoom(true);
      if (nextCheck?.folio?.guest_name) {
        setGuestNameDraft(String(nextCheck.folio.guest_name));
      } else if (nextCheck?.guest_name) {
        setGuestNameDraft(String(nextCheck.guest_name));
      }
      return;
    }
    setSelectedFolioId("");
  }

  useEffect(() => {
    if (!isPrintAgentEnabled()) return;
    void warmPrintAgentHealth();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await fetchHotelPosSettings();
        if (cancelled) return;
        if (settings?.hotel_pos_collect_payment != null) {
          setCollectPayment(Boolean(settings.hotel_pos_collect_payment));
        }
        if (settings?.hotel_pos_theme_template) {
          setThemeTemplate(normalizeHotelPosThemeTemplate(settings.hotel_pos_theme_template));
        }
        if (settings) {
          setCheckPrintSettings(normalizeHospitalityCheckPrintSettings(settings));
          setGuestNameEnabled(Boolean(settings.enable_check_guest_name));
        }
        if (settings?.table_pos_enabled != null) {
          setTablePosEnabled(Boolean(settings.table_pos_enabled));
        }
        if (settings?.payment_workflow) {
          const wf = resolveHospitalityPaymentWorkflow({
            hospitality_payment_workflow: settings.payment_workflow,
          });
          setUnpaidEnabled(wf.unpaid);
          setPartialEnabled(wf.partially_paid);
        }
        if (settings?.outlet) {
          setMenuOutlet(settings.outlet);
        }
        if (settings?.table_pos_enabled || settings?.floor_tables_enabled) {
          const tablesRes = await listHotelFloorTables();
          if (!cancelled) {
            setFloorTables(Array.isArray(tablesRes?.data) ? tablesRes.data : []);
          }
        } else {
          setFloorTables([]);
        }
      } catch {
        /* capabilities fallback already applied */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 220);
    return () => clearTimeout(t);
  }, [search]);

  const applyCatalogMeta = useCallback((res) => {
    setSearching(Boolean(res?.searching));
    if (res?.grid_columns != null) setGridColumns(normalizeHotelPosGridColumns(res.grid_columns));
    if (res?.collect_payment != null) setCollectPayment(Boolean(res.collect_payment));
    if (res?.catalog_limit != null) setCatalogLimit(Number(res.catalog_limit) || 30);
    if (res?.stock_deduct_on_settle != null) setStockDeductOnSettle(Boolean(res.stock_deduct_on_settle));
    if (res?.outlet) setMenuOutlet(res.outlet);
    setCatalogHasMore(Boolean(res?.has_more));
    setCatalogNextOffset(res?.next_offset ?? null);
  }, []);

  const loadCatalog = useCallback(
    async (q, { offset = 0, append = false } = {}) => {
      const requestId = ++catalogRequestIdRef.current;
      if (append) setCatalogLoadingMore(true);
      else setCatalogLoading(true);
      try {
        if (menuGroup === "rooms") {
          if (offlineMode) {
            if (requestId !== catalogRequestIdRef.current) return;
            setProducts([]);
            setCatalogHasMore(false);
            setCatalogNextOffset(null);
            setSearching(Boolean(String(q ?? "").trim()));
            notifyError("Room sales need a connection. Reconnect to sell rooms.");
            return;
          }
          const res = await fetchHotelPosSellableRooms({ q });
          if (requestId !== catalogRequestIdRef.current) return;
          setProducts(Array.isArray(res?.data) ? res.data : []);
          setSearching(Boolean(String(q ?? "").trim()));
          setCatalogHasMore(false);
          setCatalogNextOffset(null);
          return;
        }
        if (offlineMode) {
          const batch = await searchHotelPosOfflineCatalog(q, {
            limit: catalogLimit + offset,
            menuGroup,
          });
          if (requestId !== catalogRequestIdRef.current) return;
          const page = batch.slice(offset, offset + catalogLimit);
          setProducts((prev) => {
            if (!append) return page;
            const seen = new Set(prev.map((p) => p.product_code));
            const merged = [...prev];
            for (const item of page) {
              if (!seen.has(item.product_code)) {
                seen.add(item.product_code);
                merged.push(item);
              }
            }
            return merged;
          });
          setSearching(Boolean(String(q ?? "").trim()));
          setCatalogHasMore(offset + page.length < batch.length);
          setCatalogNextOffset(offset + page.length < batch.length ? offset + page.length : null);
          return;
        }
        const res = await fetchHotelPosCatalog({
          q,
          perPage: catalogLimit,
          popularDays: 5,
          offset,
          menuGroup,
          outletId: menuOutlet?.id ?? assignedOutletId ?? undefined,
        });
        if (requestId !== catalogRequestIdRef.current) return;
        const batch = Array.isArray(res?.items) ? res.items : [];
        setProducts((prev) => {
          if (!append) return batch;
          const seen = new Set(prev.map((p) => p.product_code));
          const merged = [...prev];
          for (const item of batch) {
            if (!seen.has(item.product_code)) {
              seen.add(item.product_code);
              merged.push(item);
            }
          }
          return merged;
        });
        applyCatalogMeta(res);
      } catch (e) {
        if (requestId !== catalogRequestIdRef.current) return;
        if (offlineMode && menuGroup !== "rooms") {
          try {
            const batch = await searchHotelPosOfflineCatalog(q, {
              limit: catalogLimit,
              menuGroup,
            });
            setProducts(batch);
            setCatalogHasMore(false);
            setCatalogNextOffset(null);
            return;
          } catch {
            /* fall through */
          }
        }
        notifyError(dedupeError(e));
        if (!append) {
          setProducts([]);
          setCatalogHasMore(false);
          setCatalogNextOffset(null);
        }
      } finally {
        if (requestId === catalogRequestIdRef.current) {
          setCatalogLoading(false);
          setCatalogLoadingMore(false);
        }
      }
    },
    [catalogLimit, applyCatalogMeta, menuGroup, offlineMode, menuOutlet?.id, assignedOutletId],
  );

  useEffect(() => {
    if (!offlineMode) return;
    void (async () => {
      const local = await loadPersistedLocalHotelCheck();
      if (local?.lines?.length) {
        setCheck(local);
      }
    })();
  }, [offlineMode]);

  useEffect(() => {
    void loadCatalog(debouncedSearch, { offset: 0, append: false });
  }, [debouncedSearch, loadCatalog, menuGroup]);

  const refreshHeldCount = useCallback(async () => {
    try {
      const outletId = menuOutlet?.id ?? assignedOutletId ?? null;
      const res = await listCollectibleHotelChecks(outletId);
      const checks = Array.isArray(res?.checks) ? res.checks : [];
      setHeldCount(checks.length);
    } catch {
      /* ignore background count errors */
    }
  }, [menuOutlet?.id, assignedOutletId]);

  useEffect(() => {
    void refreshHeldCount();
  }, [refreshHeldCount]);

  const loadMoreCatalog = useCallback(() => {
    if (catalogLoading || catalogLoadingMore || !catalogHasMore) return;
    if (catalogNextOffset == null) return;
    void loadCatalog(debouncedSearch, { offset: catalogNextOffset, append: true });
  }, [
    catalogLoading,
    catalogLoadingMore,
    catalogHasMore,
    catalogNextOffset,
    debouncedSearch,
    loadCatalog,
  ]);

  useEffect(() => {
    const root = catalogScrollRef.current;
    const sentinel = loadMoreSentinelRef.current;
    if (!root || !sentinel) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMoreCatalog();
        }
      },
      { root, rootMargin: "160px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMoreCatalog, products.length, catalogHasMore]);

  async function startFreshCheck() {
    if (sellingLocked) {
      throw new Error("Please check your internet connection");
    }
    const body = { branch_id: user?.branch_id ?? undefined };
    if (menuOutlet?.id) {
      body.outlet_id = Number(menuOutlet.id);
    }
    if (showTableField && selectedTableId) {
      body.floor_table_id = Number(selectedTableId);
    }
    const opened = await openHotelCheck(body);
    setCheck(opened?.check ?? null);
    setSelectedLineId(null);
    setGuestNameDraft("");
    resetRoomChargeSelection();
    return opened?.check ?? null;
  }

  async function ensureTableAssigned(activeCheck) {
    if (!showTableField) return activeCheck;
    const lines = activeCheck?.lines ?? [];
    const hasFnB = lines.some(
      (line) =>
        !(line?.is_room_stay || line?.modifiers?.type === "room_stay") &&
        (line?.product_code || line?.product_id),
    );
    if (lines.length > 0 && !hasFnB) {
      // Room-only ticket — table not required.
      return activeCheck;
    }
    const tableId = selectedTableId || activeCheck?.floor_table_id;
    if (!tableId) {
      tableSelectRef.current?.focus();
      throw new Error("Select a table before saving or collecting payment.");
    }
    if (Number(activeCheck?.floor_table_id) === Number(tableId)) {
      return activeCheck;
    }
    if (isLocalHotelCheckId(activeCheck?.id) || activeCheck?.offline) {
      const table = floorTables.find((t) => Number(t.id) === Number(tableId));
      const next = await patchLocalHotelCheck(activeCheck, {
        floor_table_id: Number(tableId),
        floor_table: table
          ? { id: table.id, code: table.code, label: table.label }
          : activeCheck.floor_table,
        service_mode: "table",
      });
      setCheck(next);
      return next;
    }
    const res = await assignHotelCheckTable(activeCheck.id, Number(tableId));
    const next = res?.check ?? activeCheck;
    setCheck(next);
    return next;
  }

  async function ensureGuestAssigned(activeCheck) {
    if (!showGuestField || !activeCheck?.id) return activeCheck;
    const name = String(guestNameDraft ?? "").trim();
    const current = String(activeCheck.guest_name ?? "").trim();
    if (name === current) return activeCheck;
    if (isLocalHotelCheckId(activeCheck?.id) || activeCheck?.offline) {
      const next = await patchLocalHotelCheck(activeCheck, {
        guest_name: name || null,
      });
      setCheck(next);
      return next;
    }
    const res = await assignHotelCheckGuest(activeCheck.id, name || null);
    const next = res?.check ?? activeCheck;
    setCheck(next);
    return next;
  }

  async function handleTapProduct(product) {
    if (!product?.product_code || busy) return;
    if (sellingLocked) {
      notifyError("Please check your internet connection");
      return;
    }

    if (product.is_room || menuGroup === "rooms") {
      if (!(Number(product.nightly_rate ?? product.unit_price) > 0)) {
        notifyError("This room has no nightly rate. Set a base rate on the room type.");
        return;
      }
      setRoomStayDraft({
        room: product,
        nights: 1,
        checkout_local: defaultCheckoutLocalValue(1),
        guest_name: guestNameDraft || "",
      });
      return;
    }

    if (showTableField) {
      const tableId = selectedTableId || check?.floor_table_id;
      if (!tableId) {
        notifyError("Select a table before adding items to the ticket.");
        tableSelectRef.current?.focus();
        return;
      }
    }

    setBusy(true);
    try {
      let active = check;
      const needsNew =
        !active?.id ||
        active.status === "paid" ||
        active.status === "settled" ||
        active.status === "void";

      if (needsNew) {
        active = await startFreshCheck();
      }
      if (!active?.id) throw new Error("Could not open check.");

      if (isLocalHotelCheckId(active.id) || active.offline) {
        let next = await addProductToLocalHotelCheck(active, product, 1);
        if (showGuestField && String(guestNameDraft ?? "").trim()) {
          next = await patchLocalHotelCheck(next, {
            guest_name: guestNameDraft.trim(),
          });
        }
        setCheck(next);
        return;
      }

      const res = await addHotelCheckLine(active.id, product.product_code, 1);
      let next = res?.check ?? null;
      if (next?.id && showGuestField && String(guestNameDraft ?? "").trim()) {
        try {
          const guestRes = await assignHotelCheckGuest(next.id, guestNameDraft.trim());
          next = guestRes?.check ?? next;
        } catch {
          /* guest name is optional; line add already succeeded */
        }
      }
      setCheck(next);
    } catch (e) {
      notifyError(dedupeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmRoomStay() {
    if (!roomStayDraft?.room || busy) return;
    if (sellingLocked) {
      notifyError("Please check your internet connection");
      return;
    }
    const nights = Math.max(1, Math.min(90, Number(roomStayDraft.nights) || 1));
    const checkoutIso = localDatetimeToIso(roomStayDraft.checkout_local);
    if (!checkoutIso) {
      notifyError("Choose a valid checkout date and time.");
      return;
    }
    if (new Date(checkoutIso).getTime() <= Date.now()) {
      notifyError("Checkout time must be in the future.");
      return;
    }

    setBusy(true);
    try {
      let active = check;
      const needsNew =
        !active?.id ||
        active.status === "paid" ||
        active.status === "settled" ||
        active.status === "void";

      if (needsNew) {
        active = await startFreshCheck();
      }
      if (!active?.id) throw new Error("Could not open check.");

      const guest = String(roomStayDraft.guest_name ?? "").trim();
      const roomNumber = roomStayDraft.room.room_number;
      const res = await addHotelCheckRoomStay(active.id, {
        room_id: Number(roomStayDraft.room.id),
        nights,
        checkout_at: checkoutIso,
        guest_name: guest || null,
      });
      const next = res?.check ?? null;
      setCheck(next);
      if (guest) setGuestNameDraft(guest);
      setRoomStayDraft(null);
      notifySuccess(
        `Room ${roomNumber} · ${nights} night${nights === 1 ? "" : "s"} added — collect payment to print`,
      );
      // Refresh available rooms so occupied-pending aren't re-shown after settle; after add still vacant until pay.
      if (menuGroup === "rooms") {
        void loadCatalog(debouncedSearch, { offset: 0, append: false });
      }
    } catch (e) {
      notifyError(dedupeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveSelected() {
    if (!check?.id || !selectedLineId || busy) return;
    if (sellingLocked) {
      notifyError("Please check your internet connection");
      return;
    }
    setBusy(true);
    try {
      if (isLocalHotelCheckId(check.id) || check.offline) {
        const next = await removeLocalHotelCheckLine(check, selectedLineId);
        setCheck(next);
        setSelectedLineId(null);
        return;
      }
      const res = await removeHotelCheckLine(check.id, selectedLineId);
      setCheck(res?.check ?? null);
      setSelectedLineId(null);
    } catch (e) {
      notifyError(dedupeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleClear() {
    if (!check?.id || !check.lines?.length || busy) return;
    if (sellingLocked) {
      notifyError("Please check your internet connection");
      return;
    }
    if (!window.confirm("Clear all items from this check?")) return;
    setBusy(true);
    try {
      if (isLocalHotelCheckId(check.id) || check.offline) {
        const next = await clearLocalHotelCheckLines(check);
        setCheck(next);
        setSelectedLineId(null);
        return;
      }
      const res = await clearHotelCheck(check.id);
      setCheck(res?.check ?? null);
      setSelectedLineId(null);
    } catch (e) {
      notifyError(dedupeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleVoid() {
    if (!check?.id || busy) return;
    if (sellingLocked) {
      notifyError("Please check your internet connection");
      return;
    }
    if (isLocalHotelCheckId(check.id) || check.offline) {
      if (!window.confirm(`Discard local check ${check.check_number}?`)) return;
      await idbClearLocalCheck().catch(() => {});
      setCheck(null);
      setSelectedLineId(null);
      notifySuccess("Local check discarded.");
      return;
    }
    if (Number(check.amount_paid) > 0) {
      notifyError("Cannot void a check that has payments.");
      return;
    }
    if (!["open", "unpaid", "held"].includes(String(check.status))) {
      notifyError("Only open or unpaid checks can be voided.");
      return;
    }
    if (!window.confirm(`Void check ${check.check_number}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await voidHotelCheck(check.id);
      notifySuccess(`Check ${check.check_number} voided.`);
      await startFreshCheck();
    } catch (e) {
      notifyError(dedupeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleHold() {
    if (!check?.id || !check.lines?.length || busy) return;
    if (sellingLocked) {
      notifyError("Please check your internet connection");
      return;
    }
    if (isLocalHotelCheckId(check.id) || check.offline) {
      notifyError("Hold needs an online check. Pay now, or reconnect and reopen.");
      return;
    }
    if (!unpaidEnabled) {
      notifyError("Hold / unpaid orders are not enabled for this organization.");
      return;
    }
    if (Number(check.amount_paid) > 0) {
      notifyError("This check already has payments — collect the balance instead of holding.");
      return;
    }
    setBusy(true);
    try {
      await ensureTableAssigned(check);
      let active = await ensureGuestAssigned(check);
      const res = await holdHotelCheck(active.id);
      const held = res?.check ?? active;
      notifySuccess(`Held ${held?.check_number ?? check.check_number} — open Held to resume.`);
      setCheck(null);
      setSelectedLineId(null);
      resetRoomChargeSelection();
      void refreshHeldCount();
    } catch (e) {
      notifyError(dedupeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveOrder() {
    if (!check?.id || !check.lines?.length || busy) return;
    if (sellingLocked) {
      notifyError("Please check your internet connection");
      return;
    }
    if (isLocalHotelCheckId(check.id) || check.offline) {
      notifyError("Save unpaid requires a server check. Pay now, or reopen after reconnect.");
      return;
    }
    if (!unpaidEnabled) {
      notifyError("Unpaid orders are not enabled. Use Collect payment.");
      return;
    }
    setBusy(true);
    const printWindow = openHotelReceiptPrintWindow();
    try {
      await ensureTableAssigned(check);
      let active = await ensureGuestAssigned(check);
      const res = await saveHotelCheck(active.id, {
        floor_table_id: selectedTableId ? Number(selectedTableId) : undefined,
      });
      const printed = res?.check ?? active;
      await printCheckReceiptSafe(printed, {
        title: "Unpaid order",
        organization,
        capabilities,
        user,
        checkPrintSettings,
        printWindow,
      });
      if (printed) setLastReceiptCheck(printed);
      notifySuccess(`Order ${check.check_number} saved unpaid — receipt printed.`);
      await startFreshCheck();
      void refreshHeldCount();
    } catch (e) {
      disposePrintWindow(printWindow);
      notifyError(dedupeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function openCollectibleList() {
    if (sellingLocked || offlineMode) {
      notifyError("Please check your internet connection");
      return;
    }
    setQueueOpen(true);
    try {
      const outletId = menuOutlet?.id ?? assignedOutletId ?? null;
      const res = await listCollectibleHotelChecks(outletId);
      const checks = Array.isArray(res?.checks) ? res.checks : [];
      setQueueChecks(checks);
      setHeldCount(checks.length);
    } catch (e) {
      notifyError(dedupeError(e));
      setQueueChecks([]);
    }
  }

  async function handleResumeHeld(row) {
    if (!row?.id || busy) return;
    if (sellingLocked) {
      notifyError("Please check your internet connection");
      return;
    }
    setBusy(true);
    try {
      const res = await resumeHotelCheck(row.id);
      const next = res?.check ?? row;
      setCheck(next);
      if (next?.floor_table_id) setSelectedTableId(String(next.floor_table_id));
      setGuestNameDraft(next?.guest_name ? String(next.guest_name) : "");
      syncFolioFromCheck(next);
      setSelectedLineId(null);
      setQueueOpen(false);
      notifySuccess(`Opened ${row.check_number}`);
    } catch (e) {
      notifyError(dedupeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCollectFromQueue(row) {
    if (!row?.id || busy) return;
    if (sellingLocked) {
      notifyError("Please check your internet connection");
      return;
    }
    setBusy(true);
    try {
      const res = await resumeHotelCheck(row.id);
      const next = res?.check ?? row;
      setCheck(next);
      if (next?.floor_table_id) setSelectedTableId(String(next.floor_table_id));
      setGuestNameDraft(next?.guest_name ? String(next.guest_name) : "");
      syncFolioFromCheck(next);
      setSelectedLineId(null);
      setQueueOpen(false);
      setPayError(null);
      setPayOpen(true);
    } catch (e) {
      notifyError(dedupeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handlePrimaryComplete() {
    if (!check?.id || !check.lines?.length || busy) return;
    if (sellingLocked) {
      notifyError("Please check your internet connection");
      return;
    }
    if (collectPayment) {
      setPayError(null);
      if (isLocalHotelCheckId(check.id) || check.offline) {
        setOpenFolios([]);
        setPayOpen(true);
        return;
      }

      // Room assigned on the ticket → collect via room charge and print (no extra popup).
      if (chargeToRoom && roomChargeEnabled && selectedFolioId) {
        const balance = Number(check.balance_due ?? check.total ?? 0);
        if (!(balance > 0)) {
          notifyError("Nothing to charge — balance is zero.");
          return;
        }
        await handlePaymentComplete({
          payments: [{ method_code: "ROOM", amount: balance }],
          folio_id: Number(selectedFolioId),
        });
        return;
      }

      if (roomChargeEnabled) {
        try {
          const foliosRes = await listOpenHotelFolios();
          setOpenFolios(foliosRes?.data ?? []);
        } catch {
          setOpenFolios([]);
        }
      }
      if (chargeToRoom && roomChargeEnabled && !selectedFolioId) {
        notifyError("Select a room / folio before charging to room.");
      }
      setPayOpen(true);
      return;
    }
    void handleSaveOrder();
  }

  async function handlePaymentComplete({ payments, folio_id }) {
    if (!check?.id) return;
    if (sellingLocked) {
      setPayError("Please check your internet connection");
      throw new Error("Please check your internet connection");
    }
    setBusy(true);
    setPayError(null);
    // Open while still in the Complete payment click — after await settle, popups are often blocked.
    const printWindow = openHotelReceiptPrintWindow();
    try {
      const useLocalFirst =
        isLocalHotelCheckId(check.id) ||
        Boolean(check.offline) ||
        Boolean(check.offline_client_check_uuid) ||
        isHotelLocalFirstCheckout({ payments, folioId: folio_id, check });

      if (useLocalFirst) {
        await ensureTableAssigned(check);
        let active = await ensureGuestAssigned(check);
        const cashAmount = (payments ?? []).reduce(
          (sum, p) => sum + Number(p.amount ?? 0),
          0,
        );
        const { check: paid } = await completeOfflineHotelCashCheck({
          check: active,
          user,
          organization,
          cashAmount: cashAmount || active.balance_due || active.total,
          payments,
        });
        await printCheckReceiptSafe(paid, {
          title: "Paid receipt",
          organization,
          capabilities,
          user,
          checkPrintSettings,
          printWindow,
        });
        if (paid) setLastReceiptCheck(paid);
        notifySuccess(
          `Paid ${paid?.check_number ?? ""} — ${formatHotelMoney(paid?.total)}`,
        );
        setPayOpen(false);
        setCheck(null);
        setSelectedLineId(null);
        void flushOutboxAfterSale();
        return;
      }

      await ensureTableAssigned(check);
      let active = await ensureGuestAssigned(check);
      const res = await settleHotelCheck(active.id, {
        payments,
        floor_table_id: selectedTableId ? Number(selectedTableId) : undefined,
        folio_id,
      });
      const next = res?.check;
      const status = next?.status;
      if (status === "paid" || status === "settled") {
        await printCheckReceiptSafe(next, {
          title: "Paid receipt",
          organization,
          capabilities,
          user,
          checkPrintSettings,
          printWindow,
        });
        if (next) setLastReceiptCheck(next);
        const roomLabel = next?.folio?.room_number
          ? `Rm ${next.folio.room_number}`
          : next?.folio?.folio_number
            ? `Folio ${next.folio.folio_number}`
            : null;
        const roomPaid = (payments ?? []).some(
          (p) => String(p.method_code ?? "").toUpperCase() === "ROOM",
        );
        notifySuccess(
          roomPaid && roomLabel
            ? `Charged to ${roomLabel} · ${next?.check_number ?? ""} — ${formatHotelMoney(next?.total)} (receipt printed)`
            : `Paid ${next?.check_number ?? ""} — ${formatHotelMoney(next?.total)}`,
        );
        setPayOpen(false);
        await startFreshCheck();
        if (menuGroup === "rooms") {
          void loadCatalog(debouncedSearch, { offset: 0, append: false });
        }
      } else {
        await printCheckReceiptSafe(next, {
          title: "Partial payment",
          organization,
          capabilities,
          user,
          checkPrintSettings,
          printWindow,
        });
        if (next) setLastReceiptCheck(next);
        notifySuccess(
          `Partial payment on ${next?.check_number ?? ""} — balance ${formatHotelMoney(next?.balance_due)}`,
        );
        setCheck(next);
        setPayOpen(false);
      }
      void loadCatalog(debouncedSearch, { offset: 0, append: false });
    } catch (e) {
      disposePrintWindow(printWindow);
      const message = dedupeError(e);
      setPayError(message);
      if (/stock|recipe|ingredient|inventory/i.test(message)) {
        notifyError(`${message} Configure recipes under Hospitality → Settings.`);
      }
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function handleReprintLast() {
    if (!lastReceiptCheck || busy) return;
    const status = String(lastReceiptCheck.status ?? "").toLowerCase();
    const title =
      status === "paid" || status === "settled"
        ? "Paid receipt"
        : status === "partial" || status === "partially_paid"
          ? "Partial payment"
          : "Unpaid order";
    await printCheckReceiptSafe(lastReceiptCheck, {
      title,
      organization,
      capabilities,
      user,
      checkPrintSettings,
    });
  }

  async function handleReprintFailed() {
    const failed = failedSyncChecks?.[0];
    const checkToPrint = failed?.check ?? failed;
    if (!checkToPrint) {
      notifyError("No failed offline receipt to reprint.");
      return;
    }
    setLastReceiptCheck(checkToPrint);
    await printCheckReceiptSafe(checkToPrint, {
      title: "Paid receipt",
      organization,
      capabilities,
      user,
      checkPrintSettings,
    });
  }

  async function bumpQty(line, delta) {
    if (!check?.id || !line?.id || busy) return;
    if (sellingLocked) {
      notifyError("Please check your internet connection");
      return;
    }
    const nextQty = Number(line.qty) + delta;
    setBusy(true);
    try {
      if (isLocalHotelCheckId(check.id) || check.offline) {
        const next =
          nextQty <= 0
            ? await removeLocalHotelCheckLine(check, line.id)
            : await updateLocalHotelCheckLineQty(check, line.id, nextQty);
        setCheck(next);
        if (nextQty <= 0) setSelectedLineId(null);
        return;
      }
      const res =
        nextQty <= 0
          ? await removeHotelCheckLine(check.id, line.id)
          : await updateHotelCheckLineQty(check.id, line.id, nextQty);
      setCheck(res?.check ?? null);
      if (nextQty <= 0) setSelectedLineId(null);
    } catch (e) {
      notifyError(dedupeError(e));
    } finally {
      setBusy(false);
    }
  }

  const lines = check?.lines ?? [];
  const hasLines = lines.length > 0;
  const menuChannel = menuOutlet?.menu_channel ?? null;
  const posTitle = menuChannel === "bar" ? "Bar POS" : "Restaurant POS";
  const outletAssigned = Boolean(assignedOutletId);
  const gridStyle = useMemo(
    () => ({ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }),
    [gridColumns],
  );
  const themeVars = useMemo(() => hotelPosThemeCssVars(themeTemplate), [themeTemplate]);
  const primaryCtaLabel = collectPayment
    ? chargeToRoom && roomChargeEnabled
      ? "Charge to room"
      : "Pay"
    : "Save";
  const emptyTicketHint = chargeToRoom && roomChargeEnabled
    ? selectedFolioId
      ? "Tap a menu item — Charge to room will collect payment and print"
      : "Assign a room / folio, then tap a menu item"
    : showTableField
      ? "Choose a table, then tap a menu item to add it here"
      : "Tap a menu item to add it here";

  return (
    <div
      className="hotel-pos-root relative flex min-h-0 flex-1 flex-col overflow-hidden"
      data-hotel-pos-theme={themeTemplate}
      style={themeVars}
    >
      <div className="hotel-pos-atmosphere pointer-events-none absolute inset-0" aria-hidden />

      {sellingLocked ? (
        <div
          className="absolute inset-0 z-[80] flex items-center justify-center bg-slate-950/55 px-6 backdrop-blur-[2px]"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="hotel-pos-offline-lock-title"
        >
          <div className="max-w-md rounded-2xl bg-white px-6 py-8 text-center shadow-xl">
            <p
              id="hotel-pos-offline-lock-title"
              className="text-lg font-semibold text-slate-900"
            >
              Please check your internet connection
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Hotel POS cannot sell while offline. Reconnect to continue — pending receipts will sync
              automatically.
            </p>
            {pendingSync > 0 ? (
              <p className="mt-3 text-xs font-medium text-amber-700">
                {pendingSync} check(s) waiting to sync
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="pos-header hotel-pos-header relative z-50 shrink-0 shadow-sm">
        <div className="pos-header-bar grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 lg:px-5">
          <div className="pos-header-brand-wrap justify-self-start">
            <CentrixLogoHeader
              markSize={28}
              title={PRODUCT_NAME}
              orgSubtitle={organization?.org_name ?? ""}
            />
          </div>
          <div className="hotel-pos-header-context min-w-0 justify-self-center px-2 text-center">
            <p className="theme-heading text-[11px] font-semibold uppercase tracking-[0.08em] sm:text-xs">
              {posTitle}
            </p>
            {(menuOutlet?.name || menuOutlet?.menu_channel_label) ? (
              <p className="theme-subtext mt-0.5 truncate text-[11px] sm:text-xs">
                {[menuOutlet?.name, menuOutlet?.menu_channel_label ? `${menuOutlet.menu_channel_label} menu` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
            {!outletAssigned ? (
              <p className="mt-0.5 text-[10px] font-medium text-amber-700">
                Assign this cashier to Bar or Restaurant under Users
              </p>
            ) : null}
          </div>
          <div className="hotel-pos-header-tools relative z-[60] flex shrink-0 items-center justify-end gap-1.5 justify-self-end sm:gap-2">
            {lastReceiptCheck ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleReprintLast()}
                className="pos-header-action-btn inline-flex items-center rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide disabled:opacity-50"
                title={`Reprint ${lastReceiptCheck.check_number ?? "last receipt"}`}
              >
                Reprint
              </button>
            ) : null}
            <NotificationBell />
            <WorkspaceSwitcher />
            <UserAccountMenu
              showName={false}
              triggerClassName="pos-header-action-btn inline-flex items-center rounded-md p-1"
            />
          </div>
        </div>
      </div>

      <div className="relative z-0 flex min-h-0 flex-1 flex-col lg:flex-row overflow-hidden">
        <div className="hotel-pos-menu-pane flex min-h-0 min-w-0 flex-1 flex-col border-b border-[var(--theme-border)]/80 lg:border-b-0 lg:border-r">
          <div className="shrink-0 space-y-3 px-3 pb-2 pt-3 sm:px-4 lg:px-5">
            <div
              className="hotel-pos-chip-scroll flex flex-wrap items-center justify-center gap-2 overflow-x-auto pb-0.5"
              role="toolbar"
              aria-label="Menu filter and hold"
            >
              {visibleMenuChips.map((chip) => (
                <button
                  key={chip.id || "all"}
                  type="button"
                  aria-pressed={menuGroup === chip.id}
                  title={`Show ${chip.label.toLowerCase()} menu`}
                  onClick={() => setMenuGroup(chip.id)}
                  className={`hotel-pos-chip shrink-0${
                    menuGroup === chip.id ? " hotel-pos-chip-active" : ""
                  }`}
                >
                  {chip.label}
                </button>
              ))}
              <span className="mx-0.5 hidden h-5 w-px bg-[var(--theme-border)] sm:inline-block" aria-hidden />
              <button
                type="button"
                title={
                  !hasLines
                    ? "Add items before holding"
                    : !unpaidEnabled
                      ? "Unpaid / hold is not enabled for this organization"
                      : "Hold this check and clear the ticket"
                }
                disabled={busy || sellingLocked || !hasLines || !unpaidEnabled}
                onClick={() => void handleHold()}
                className="hotel-pos-chip hotel-pos-chip-action shrink-0 disabled:opacity-40"
              >
                Hold
              </button>
              <button
                type="button"
                title="View held and unpaid checks"
                disabled={busy || sellingLocked}
                onClick={() => void openCollectibleList()}
                className="hotel-pos-chip hotel-pos-chip-action shrink-0 disabled:opacity-40"
              >
                Held
                {heldCount > 0 ? (
                  <span className="hotel-pos-chip-badge ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums">
                    {heldCount}
                  </span>
                ) : null}
              </button>
            </div>

            <label className="sr-only" htmlFor="hotel-pos-search-item">
              Search item
            </label>
            <input
              id="hotel-pos-search-item"
              ref={searchRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={menuGroup === "rooms" ? "Search room…" : "Search item…"}
              className="theme-input hotel-pos-field w-full rounded-xl px-4 py-2.5 text-sm"
              autoComplete="off"
            />
            {showTableField && !floorTables.length ? (
              <p className="theme-subtext text-[11px]">
                No tables yet — enable Floor tables and add them under Operations → Outlets.
              </p>
            ) : null}
            {stockDeductOnSettle ? (
              <p className="theme-subtext text-[11px] leading-relaxed">
                Stock deduct on settle is on.{" "}
                <Link href="/admin/hotel-settings" className="font-semibold underline">
                  Hotel F&amp;B settings
                </Link>
              </p>
            ) : null}
          </div>

          <div ref={catalogScrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 sm:px-5">
            {catalogLoading && !products.length ? (
              <p className="theme-subtext py-20 text-center text-sm">
                {menuGroup === "rooms" ? "Loading rooms…" : "Loading menu…"}
              </p>
            ) : !products.length ? (
              <p className="theme-subtext py-20 text-center text-sm">
                {menuGroup === "rooms"
                  ? debouncedSearch
                    ? "No available rooms match your search."
                    : "No vacant rooms right now."
                  : debouncedSearch
                    ? "No products match your search."
                    : "No products in catalogue yet."}
              </p>
            ) : (
              <>
                <div className="grid gap-3" style={gridStyle}>
                  {products.map((product) => {
                    const hasImage = Boolean(product.has_image || product.image_url);
                    const isRoom = Boolean(product.is_room || menuGroup === "rooms");
                    return (
                      <button
                        key={product.product_code || product.id}
                        type="button"
                        disabled={busy}
                        onClick={() => void handleTapProduct(product)}
                        className="hotel-pos-tile group relative flex min-h-[7.5rem] flex-col overflow-hidden text-left transition duration-150 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50"
                      >
                        <div className="hotel-pos-tile-shine pointer-events-none absolute inset-x-0 top-0 h-1 opacity-0 transition group-hover:opacity-100" />
                        {hasImage ? (
                          <div className="hotel-pos-tile-media relative aspect-[4/3] w-full overflow-hidden bg-[var(--theme-surface-muted)]">
                            <HotelPosProductImage
                              productCode={product.product_code}
                              offlineMode={offlineMode}
                              alt={product.product_name}
                              className="h-full w-full object-cover"
                              placeholderClassName="flex h-full items-center justify-center px-1 text-center text-[9px] text-slate-400"
                            />
                            {product.is_popular ? (
                              <span className="hotel-pos-top-badge absolute left-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                                Top
                              </span>
                            ) : null}
                          </div>
                        ) : isRoom ? (
                          <div className="hotel-pos-tile-media relative flex aspect-[4/3] w-full items-center justify-center bg-[var(--theme-surface-muted)]">
                            <span className="theme-heading text-3xl font-bold tabular-nums">
                              {product.room_number}
                            </span>
                          </div>
                        ) : null}
                        <div className="flex min-h-0 flex-1 flex-col justify-between gap-2 p-3.5">
                          <div className="flex items-start justify-between gap-2">
                            <span className="theme-heading line-clamp-2 text-[15px] font-semibold leading-snug">
                              {isRoom
                                ? `Room ${product.room_number}`
                                : product.product_name}
                            </span>
                            {!hasImage && !isRoom && product.is_popular ? (
                              <span className="hotel-pos-top-badge shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                                Top
                              </span>
                            ) : null}
                          </div>
                          {isRoom && product.room_type?.name ? (
                            <p className="theme-subtext text-[11px]">{product.room_type.name}</p>
                          ) : null}
                          <div className="flex items-end justify-between gap-2">
                            <p className="text-base font-bold tabular-nums text-[var(--theme-accent-text)]">
                              {formatHotelMoney(product.unit_price ?? product.nightly_rate)}
                              {isRoom ? (
                                <span className="theme-subtext ml-1 text-[10px] font-semibold uppercase">
                                  / night
                                </span>
                              ) : null}
                            </p>
                            <span className="hotel-pos-add-chip rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide opacity-80 group-hover:opacity-100">
                              {isRoom ? "Book" : "Add"}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div ref={loadMoreSentinelRef} className="h-8 w-full" aria-hidden />
                {catalogLoadingMore ? (
                  <p className="theme-subtext py-3 text-center text-xs">Loading more…</p>
                ) : null}
                {!catalogHasMore && products.length > 0 ? (
                  <p className="theme-subtext py-3 text-center text-[11px]">
                    {searching ? "End of search results" : "All menu items loaded"}
                  </p>
                ) : null}
              </>
            )}
          </div>

          <HotelPosStatusFooter
            user={user}
            heldCount={heldCount}
            version="1.0.0"
            connectionStatus={connectionStatus}
            pendingSync={pendingSync}
            failedSyncCount={failedSyncChecks?.length ?? 0}
            checkNumbersLeft={checkNumbersLeft}
            syncing={offlineSyncing}
            offlineMode={offlineMode}
            onSync={syncOfflineChecks}
            onReprintFailed={handleReprintFailed}
          />
        </div>

        <div className="hotel-pos-check-pane flex min-h-0 w-full flex-col lg:w-[min(100%,26rem)] xl:w-[30rem] shrink-0">
          <div className="shrink-0 space-y-3 border-b border-[var(--theme-border)] px-4 py-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--theme-accent-text)]">
                  Check
                </p>
                <p className="theme-heading mt-0.5 font-mono text-lg font-semibold">
                  {check?.check_number ?? "New"}
                </p>
              </div>
              <span className="hotel-pos-status-pill rounded-full px-3 py-1 text-[11px] font-semibold capitalize">
                {check?.status ?? "ready"}
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {showTableField ? (
                <div className={showGuestField || roomChargeEnabled ? undefined : "sm:col-span-2"}>
                  <label className="sr-only" htmlFor="hotel-pos-table-select">
                    Choose table
                  </label>
                  <SearchableSelect
                    ref={tableSelectRef}
                    className="theme-input hotel-pos-field w-full rounded-xl px-3 py-2.5 text-sm"
                    value={selectedTableId}
                    onChange={setSelectedTableId}
                    placeholder="Choose table…"
                    options={[
                      { value: "", label: "Choose table…" },
                      ...floorTables.map((table) => ({
                        value: String(table.id),
                        label: `${table.label || table.code}${table.zone ? ` · ${table.zone}` : ""}`,
                      })),
                    ]}
                  />
                </div>
              ) : null}
              {showGuestField ? (
                <div className={showTableField || roomChargeEnabled ? undefined : "sm:col-span-2"}>
                  <label className="sr-only" htmlFor="hotel-pos-guest-name">
                    Guest name
                  </label>
                  <input
                    id="hotel-pos-guest-name"
                    type="text"
                    value={guestNameDraft}
                    onChange={(e) => setGuestNameDraft(e.target.value)}
                    placeholder="Guest name (optional)"
                    className="theme-input hotel-pos-field w-full rounded-xl px-3 py-2.5 text-sm"
                    autoComplete="off"
                    maxLength={160}
                  />
                </div>
              ) : null}
              {roomChargeEnabled ? (
                <div className="sm:col-span-2">
                  <label className="sr-only" htmlFor="hotel-pos-room-folio">
                    Assign room / folio
                  </label>
                  <SearchableSelect
                    className="theme-input hotel-pos-field w-full rounded-xl px-3 py-2.5 text-sm"
                    value={selectedFolioId}
                    onChange={applySelectedFolio}
                    disabled={!collectPayment || offlineMode}
                    placeholder={
                      offlineMode
                        ? "Reconnect to use room charge"
                        : openFolios.length
                          ? "Assign room / folio…"
                          : "No open guest folios"
                    }
                    options={[
                      {
                        value: "",
                        label: offlineMode
                          ? "Reconnect to use room charge"
                          : openFolios.length
                            ? "Assign room / folio…"
                            : "No open guest folios",
                      },
                      ...openFolios.map((folio) => ({
                        value: String(folio.id),
                        label: `${folio.room_number ? `Rm ${folio.room_number}` : "No room"}${folio.guest_name ? ` · ${folio.guest_name}` : ""}${folio.folio_number ? ` · ${folio.folio_number}` : ""}`,
                      })),
                    ]}
                  />
                </div>
              ) : null}
              {roomChargeEnabled ? (
                <div className={showTableField || showGuestField ? undefined : "sm:col-span-2"}>
                  <label className="sr-only" htmlFor="hotel-pos-order-type">
                    Order type
                  </label>
                  <SearchableSelect
                    className="theme-input hotel-pos-field w-full rounded-xl px-3 py-2.5 text-sm"
                    value={chargeToRoom ? "room" : "pay"}
                    onChange={(v) => {
                      const toRoom = v === "room";
                      setChargeToRoom(toRoom);
                      if (!toRoom) setSelectedFolioId("");
                    }}
                    disabled={!collectPayment}
                    options={[
                      { value: "pay", label: "Collect payment" },
                      { value: "room", label: "Charge to room" },
                    ]}
                  />
                </div>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2">
            {!hasLines ? (
              <div className="hotel-pos-empty-ticket mx-2 mt-3 rounded-2xl px-4 py-14 text-center">
                <p className="theme-heading text-sm font-semibold">Ticket is empty</p>
                <p className="theme-subtext mt-1 text-xs">{emptyTicketHint}</p>
              </div>
            ) : (
              <ul className="space-y-2 px-2 py-3">
                {lines.map((line) => {
                  const selected = selectedLineId === line.id;
                  return (
                    <li key={line.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedLineId(line.id)}
                        className={`hotel-pos-line flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition ${
                          selected ? "hotel-pos-line-selected" : ""
                        }`}
                      >
                        {line.image_url ? (
                          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-[var(--theme-surface-muted)] ring-1 ring-[var(--theme-border)]">
                            <EntityPhotoDisplay
                              fileUrl={
                                line.product_code
                                  ? productPhotoFileUrl(line.product_code)
                                  : undefined
                              }
                              imageUrl={line.image_url}
                              alt={line.description}
                              className="h-full w-full object-cover"
                              placeholderClassName="flex h-full items-center justify-center text-[9px] text-slate-400"
                            />
                          </div>
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <p className="theme-heading text-sm font-semibold">{line.description}</p>
                          <p className="theme-subtext mt-0.5 text-xs">
                            {line.is_room_stay || line.modifiers?.type === "room_stay"
                              ? `${formatHotelMoney(line.unit_price)} / night`
                              : `${formatHotelMoney(line.unit_price)} each`}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <span className="text-sm font-bold tabular-nums">
                            {formatHotelMoney(line.line_total)}
                          </span>
                          {line.is_room_stay || line.modifiers?.type === "room_stay" ? (
                            <span className="theme-subtext text-[11px] font-semibold tabular-nums">
                              {Number(line.qty)} night{Number(line.qty) === 1 ? "" : "s"}
                            </span>
                          ) : (
                            <div
                              className="flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                className="theme-secondary-btn flex h-8 w-8 items-center justify-center rounded-full text-base font-bold"
                                disabled={busy}
                                onClick={() => void bumpQty(line, -1)}
                                aria-label="Decrease quantity"
                              >
                                −
                              </button>
                              <span className="min-w-[1.75rem] text-center text-sm font-semibold tabular-nums">
                                {line.qty}
                              </span>
                              <button
                                type="button"
                                className="theme-secondary-btn flex h-8 w-8 items-center justify-center rounded-full text-base font-bold"
                                disabled={busy}
                                onClick={() => void bumpQty(line, 1)}
                                aria-label="Increase quantity"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="hotel-pos-totals shrink-0 border-t border-[var(--theme-border)] px-4 py-4">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="theme-subtext text-[11px] uppercase tracking-wide">
                  {Number(check?.amount_paid) > 0 ? "Balance" : "Total"}
                </p>
                <p className="text-2xl font-bold tabular-nums text-[var(--theme-accent-text)]">
                  {formatHotelMoney(
                    Number(check?.balance_due ?? Math.max(0, Number(check?.total ?? 0) - Number(check?.amount_paid ?? 0))),
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="theme-subtext text-xs">VAT incl. {formatHotelMoney(check?.vat_total ?? 0)}</p>
                {Number(check?.amount_paid) > 0 ? (
                  <p className="theme-subtext text-xs">
                    Paid {formatHotelMoney(check.amount_paid)} / {formatHotelMoney(check.total)}
                  </p>
                ) : null}
                {check?.floor_table ? (
                  <p className="theme-subtext text-xs">
                    Table {check.floor_table.label || check.floor_table.code}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mb-2.5 grid grid-cols-2 gap-2">
              <PosActionButton
                label="Remove"
                title="Remove selected line"
                icon="−"
                disabled={busy || !selectedLineId}
                onClick={() => void handleRemoveSelected()}
              />
              <PosActionButton
                label="Clear"
                title="Clear all lines"
                icon="⌫"
                iconClass="pos-cart-action-icon--warn"
                disabled={busy || !hasLines || Number(check?.amount_paid) > 0}
                onClick={() => void handleClear()}
              />
            </div>

            {collectPayment ? (
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={busy || !hasLines || !unpaidEnabled || Number(check?.amount_paid) > 0}
                  onClick={() => void handleHold()}
                  className="hotel-pos-secondary-cta rounded-xl py-3.5 text-sm font-bold uppercase tracking-wide disabled:opacity-40"
                  title={
                    !unpaidEnabled
                      ? "Hold / unpaid is not enabled"
                      : "Hold this check and clear the ticket"
                  }
                >
                  Hold
                </button>
                <button
                  type="button"
                  disabled={busy || !hasLines}
                  onClick={() => void handlePrimaryComplete()}
                  className="hotel-pos-primary-cta rounded-xl py-3.5 text-sm font-bold uppercase tracking-wide disabled:opacity-40"
                >
                  {primaryCtaLabel}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={busy || !hasLines || !unpaidEnabled}
                  onClick={() => void handleHold()}
                  className="hotel-pos-secondary-cta rounded-xl py-3.5 text-sm font-bold uppercase tracking-wide disabled:opacity-40"
                >
                  Hold
                </button>
                <button
                  type="button"
                  disabled={busy || !hasLines || !unpaidEnabled}
                  onClick={() => void handleSaveOrder()}
                  className="hotel-pos-primary-cta rounded-xl py-3.5 text-sm font-bold uppercase tracking-wide disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            )}
            {collectPayment ? null : (
              <p className="theme-subtext mt-2 text-center text-xs">
                Save unpaid mode — collect payment later from Held.
              </p>
            )}
            <button
              type="button"
              disabled={
                busy ||
                !check?.id ||
                Number(check?.amount_paid) > 0 ||
                !["open", "unpaid", "held"].includes(String(check?.status))
              }
              onClick={() => void handleVoid()}
              className="hotel-pos-danger-btn mt-3 w-full rounded-xl py-3.5 text-sm font-semibold uppercase tracking-wide disabled:opacity-40"
            >
              Void check
            </button>
          </div>
        </div>
      </div>

      {queueOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--theme-border)] px-4 py-3">
              <h2 className="theme-heading text-base font-semibold">Held orders</h2>
              <button
                type="button"
                className="theme-secondary-btn rounded-lg px-3 py-1 text-xs font-semibold"
                onClick={() => setQueueOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {!queueChecks.length ? (
                <p className="theme-subtext px-3 py-8 text-center text-sm">No held orders</p>
              ) : (
                queueChecks.map((row) => (
                  <div
                    key={row.id}
                    className="mb-1 flex items-center gap-2 rounded-xl px-3 py-3 hover:bg-[var(--theme-hover)]"
                  >
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleResumeHeld(row)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="theme-heading block text-sm font-semibold">{row.check_number}</span>
                      <span className="theme-subtext text-xs capitalize">
                        {String(row.status ?? "").replace(/_/g, " ")}
                        {row.floor_table?.label || row.floor_table?.code
                          ? ` · ${row.floor_table.label || row.floor_table.code}`
                          : ""}
                        {` · bal ${formatHotelMoney(row.balance_due ?? row.total)}`}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleCollectFromQueue(row)}
                      className="theme-secondary-btn shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold"
                    >
                      Collect
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {roomStayDraft ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="hotel-pos-room-stay-title"
            className="w-full max-w-md rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 shadow-xl"
          >
            <h2 id="hotel-pos-room-stay-title" className="theme-heading text-lg font-semibold">
              Room {roomStayDraft.room.room_number}
            </h2>
            <p className="theme-subtext mt-1 text-sm">
              {formatHotelMoney(roomStayDraft.room.nightly_rate ?? roomStayDraft.room.unit_price)} / night
              {roomStayDraft.room.room_type?.name ? ` · ${roomStayDraft.room.room_type.name}` : ""}
            </p>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="theme-subtext mb-1 block text-[11px] font-semibold uppercase tracking-wide">
                  Nights
                </span>
                <SearchableSelect
                  className="theme-input hotel-pos-field w-full rounded-xl px-3 py-2.5 text-sm"
                  value={String(roomStayDraft.nights)}
                  onChange={(v) => {
                    const nights = Number(v) || 1;
                    setRoomStayDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            nights,
                            checkout_local: defaultCheckoutLocalValue(nights),
                          }
                        : prev,
                    );
                  }}
                  options={Array.from({ length: 14 }, (_, i) => i + 1).map((n) => ({
                    value: String(n),
                    label: `${n} night${n === 1 ? "" : "s"}`,
                  }))}
                />
              </label>
              <label className="block">
                <span className="theme-subtext mb-1 block text-[11px] font-semibold uppercase tracking-wide">
                  Checkout date &amp; time
                </span>
                <input
                  type="datetime-local"
                  className="theme-input hotel-pos-field w-full rounded-xl px-3 py-2.5 text-sm"
                  value={roomStayDraft.checkout_local}
                  onChange={(e) =>
                    setRoomStayDraft((prev) =>
                      prev ? { ...prev, checkout_local: e.target.value } : prev,
                    )
                  }
                />
              </label>
              <label className="block">
                <span className="theme-subtext mb-1 block text-[11px] font-semibold uppercase tracking-wide">
                  Guest name
                </span>
                <input
                  type="text"
                  className="theme-input hotel-pos-field w-full rounded-xl px-3 py-2.5 text-sm"
                  value={roomStayDraft.guest_name}
                  onChange={(e) =>
                    setRoomStayDraft((prev) =>
                      prev ? { ...prev, guest_name: e.target.value } : prev,
                    )
                  }
                  placeholder="Guest name"
                  maxLength={160}
                />
              </label>
              <p className="theme-subtext text-xs">
                Total{" "}
                <strong className="theme-heading">
                  {formatHotelMoney(
                    Number(roomStayDraft.room.nightly_rate ?? roomStayDraft.room.unit_price) *
                      Math.max(1, Number(roomStayDraft.nights) || 1),
                  )}
                </strong>
                . Room stays occupied until checkout time, then go to housekeeping (dirty). Do not sell a room that already has an open PMS folio stay — use Front desk for folio guests.
              </p>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setRoomStayDraft(null)}
                className="theme-secondary-btn flex-1 rounded-xl py-3 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmRoomStay()}
                className="hotel-pos-primary-cta flex-1 rounded-xl py-3 text-sm font-bold uppercase tracking-wide disabled:opacity-40"
              >
                Add to ticket
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <HotelPosPaymentPanel
        open={payOpen}
        onClose={() => {
          if (!busy) setPayOpen(false);
        }}
        billTotal={Number(
          check?.balance_due ??
            Math.max(0, Number(check?.total ?? 0) - Number(check?.amount_paid ?? 0)),
        )}
        paymentConfig={paymentConfig}
        saving={busy}
        error={payError}
        allowPartial={partialEnabled}
        roomChargeEnabled={roomChargeEnabled && !offlineMode}
        openFolios={openFolios}
        preferRoomCharge={chargeToRoom && roomChargeEnabled && !offlineMode}
        initialFolioId={selectedFolioId}
        onComplete={handlePaymentComplete}
      />
    </div>
  );
}
