"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { useHotelPosOfflineSupport } from "@/hooks/use-hotel-pos-offline-support";
import { ApiError } from "@/lib/api";
import {
  addHotelCheckLine,
  assignHotelCheckGuest,
  assignHotelCheckTable,
  clearHotelCheck,
  fetchHotelPosCatalog,
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
  createLocalHotelCheck,
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
  resolveHotelPosSettings,
} from "@/lib/hotel-pos-settings";
import {
  hotelPosThemeCssVars,
  normalizeHotelPosThemeTemplate,
} from "@/lib/hotel-pos-theme-templates";
import { resolveHospitalityPaymentWorkflow } from "@/lib/hospitality-payment-workflow";
import { isHospitalityServiceEnabled } from "@/lib/hospitality-services";
import { getCheckoutPaymentConfig } from "@/lib/sales-settings";
import { notifyError, notifySuccess } from "@/lib/notify";
import { PRODUCT_NAME } from "@/lib/branding";
import { CentrixLogoHeader } from "@/components/branding/centrix-logo";
import { PosActionButton } from "@/components/sales/pos-action-button";
import { HotelPosPaymentPanel } from "@/components/hospitality/hotel-pos-payment-panel";
import { HotelPosStatusFooter } from "@/components/hospitality/hotel-pos-status-footer";
import { printHospitalityCheckReceipt } from "@/components/hospitality/hospitality-check-receipt-print";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { EntityPhotoDisplay, productPhotoFileUrl } from "@/components/media/entity-photo-display";
import { NotificationBell } from "@/components/layout/notification-bell";
import { UserAccountMenu } from "@/components/layout/user-account-menu";
import { isPrintAgentEnabled, warmPrintAgentHealth } from "@/lib/print-agent";

const MENU_FILTER_CHIPS = [
  { id: "", label: "All", short: "All" },
  { id: "food", label: "Food", short: "Food" },
  { id: "drinks", label: "Drinks", short: "Drinks" },
];

const SERVICE_MODES = [
  { id: "dine_in", label: "Dine in", short: "Dine in" },
  { id: "room_service", label: "Room service", short: "Room" },
  { id: "take_away", label: "Take away", short: "Takeaway" },
];

async function printCheckReceiptSafe(check, options) {
  try {
    const result = await printHospitalityCheckReceipt(check, options);
    if (result && result.ok === false) {
      notifyError("Receipt could not be printed. Check the Centrix Print Agent or allow pop-ups.");
    }
    return result;
  } catch (e) {
    notifyError(dedupeError(e) || "Receipt print failed.");
    return null;
  }
}

function dedupeError(e) {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}

export function HotelBarPosScreen() {
  const { capabilities, user, organization } = useAuth();
  const {
    status: connectionStatus,
    offlineMode,
    pendingSync,
    syncing: offlineSyncing,
    flushOutboxAfterSale,
    syncOfflineChecks,
  } = useHotelPosOfflineSupport({ enabled: true });
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
  const [serviceMode, setServiceMode] = useState("dine_in");
  const [chargeToRoom, setChargeToRoom] = useState(false);
  const [heldCount, setHeldCount] = useState(0);
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
    isHospitalityServiceEnabled(capabilities, "room_charge"),
  );
  const [openFolios, setOpenFolios] = useState([]);
  const [menuOutlet, setMenuOutlet] = useState(null);
  const searchRef = useRef(null);
  const tableSelectRef = useRef(null);
  const catalogScrollRef = useRef(null);
  const loadMoreSentinelRef = useRef(null);
  const catalogRequestIdRef = useRef(0);

  const showGuestField = guestNameEnabled || serviceMode === "room_service";
  const showTableField = tablePosEnabled && serviceMode === "dine_in";

  const paymentConfig = useMemo(
    () =>
      getCheckoutPaymentConfig(capabilities?.module_settings, {
        checkoutContext: "pos",
        capabilities,
      }),
    [capabilities],
  );

  useEffect(() => {
    setGridColumns(hotelSettings.gridColumns);
    setCollectPayment(hotelSettings.collectPayment);
    setCatalogLimit(hotelSettings.catalogLimit);
    setStockDeductOnSettle(hotelSettings.stockDeductOnSettle);
    setThemeTemplate(hotelSettings.themeTemplate);
    setTablePosEnabled(isHospitalityServiceEnabled(capabilities, "table_pos"));
    setRoomChargeEnabled(isHospitalityServiceEnabled(capabilities, "room_charge"));
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
    if (serviceMode === "room_service" && roomChargeEnabled && collectPayment) {
      setChargeToRoom(true);
    }
    if (serviceMode === "take_away") {
      setChargeToRoom(false);
    }
  }, [serviceMode, roomChargeEnabled, collectPayment]);

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
          setCheckPrintSettings({
            check_receipt_copies: settings.check_receipt_copies ?? 1,
            show_outlet_on_check_receipt: settings.show_outlet_on_check_receipt !== false,
            show_organization_on_check_receipt: settings.show_organization_on_check_receipt !== false,
            enable_check_guest_name: Boolean(settings.enable_check_guest_name),
            check_receipt_footer: settings.check_receipt_footer ?? "Thank you",
            use_same_print_phones_for_check: settings.use_same_print_phones_for_check !== false,
            check_print_phones: settings.check_print_phones ?? { tel1: "", tel2: "" },
          });
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
        if (offlineMode) {
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
    [catalogLimit, applyCatalogMeta, menuGroup, offlineMode],
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
      const res = await listCollectibleHotelChecks();
      const checks = Array.isArray(res?.checks) ? res.checks : [];
      setHeldCount(checks.length);
    } catch {
      /* ignore background count errors */
    }
  }, []);

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
    if (offlineMode) {
      const opened = await createLocalHotelCheck({
        user,
        outlet: menuOutlet,
        floorTableId: showTableField && selectedTableId ? Number(selectedTableId) : null,
        guestName: showGuestField ? guestNameDraft : null,
        branchId: user?.branch_id ?? null,
      });
      setCheck(opened);
      setSelectedLineId(null);
      setGuestNameDraft(opened.guest_name ? String(opened.guest_name) : "");
      setChargeToRoom(false);
      return opened;
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
    setChargeToRoom(false);
    return opened?.check ?? null;
  }

  async function ensureTableAssigned(activeCheck) {
    if (!showTableField) return activeCheck;
    const tableId = selectedTableId || activeCheck?.floor_table_id;
    if (!tableId) {
      tableSelectRef.current?.focus();
      throw new Error("Select a table before saving or collecting payment.");
    }
    if (Number(activeCheck?.floor_table_id) === Number(tableId)) {
      return activeCheck;
    }
    if (offlineMode || isLocalHotelCheckId(activeCheck?.id)) {
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
    if (offlineMode || isLocalHotelCheckId(activeCheck?.id)) {
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
        active.status === "void" ||
        (offlineMode && active?.id && !isLocalHotelCheckId(active.id) && !active.offline);

      if (needsNew) {
        if (offlineMode && active?.id && !isLocalHotelCheckId(active.id)) {
          notifySuccess("Switched to a local ticket — online check stays on the server for later.");
        }
        active = await startFreshCheck();
      }
      if (!active?.id) throw new Error("Could not open check.");

      if (offlineMode || isLocalHotelCheckId(active.id) || active.offline) {
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

  async function handleRemoveSelected() {
    if (!check?.id || !selectedLineId || busy) return;
    setBusy(true);
    try {
      if (offlineMode || isLocalHotelCheckId(check.id) || check.offline) {
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
    if (!window.confirm("Clear all items from this check?")) return;
    setBusy(true);
    try {
      if (offlineMode || isLocalHotelCheckId(check.id) || check.offline) {
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
    if (offlineMode || isLocalHotelCheckId(check.id) || check.offline) {
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
    if (offlineMode || isLocalHotelCheckId(check.id) || check.offline) {
      notifyError("Hold is not available offline. Pay with cash, or reconnect to save unpaid.");
      return;
    }
    if (!unpaidEnabled) {
      notifyError("Unpaid orders are not enabled for this organization.");
      return;
    }
    setBusy(true);
    try {
      await ensureTableAssigned(check);
      let active = check;
      active = await ensureGuestAssigned(active);
      const res = await holdHotelCheck(active.id);
      await printCheckReceiptSafe(res?.check ?? active, {
        title: "Unpaid order",
        organization,
        printSettings: checkPrintSettings,
      });
      notifySuccess(`Order ${check.check_number} saved unpaid.`);
      await startFreshCheck();
      void refreshHeldCount();
    } catch (e) {
      notifyError(dedupeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveOrder() {
    if (!check?.id || !check.lines?.length || busy) return;
    if (offlineMode || isLocalHotelCheckId(check.id) || check.offline) {
      notifyError("Save unpaid is not available offline. Pay with cash, or reconnect.");
      return;
    }
    if (!unpaidEnabled) {
      notifyError("Unpaid orders are not enabled. Use Collect payment.");
      return;
    }
    setBusy(true);
    try {
      await ensureTableAssigned(check);
      let active = await ensureGuestAssigned(check);
      const res = await saveHotelCheck(active.id, {
        floor_table_id: selectedTableId ? Number(selectedTableId) : undefined,
      });
      await printCheckReceiptSafe(res?.check ?? active, {
        title: "Unpaid order",
        organization,
        printSettings: checkPrintSettings,
      });
      notifySuccess(`Order ${check.check_number} saved unpaid — receipt printed.`);
      await startFreshCheck();
      void refreshHeldCount();
    } catch (e) {
      notifyError(dedupeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function openCollectibleList() {
    if (offlineMode) {
      notifyError("Unpaid queue requires a connection. Cash sell still works offline.");
      return;
    }
    setQueueOpen(true);
    try {
      const res = await listCollectibleHotelChecks();
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
    setBusy(true);
    try {
      const res = await resumeHotelCheck(row.id);
      const next = res?.check ?? row;
      setCheck(next);
      if (next?.floor_table_id) setSelectedTableId(String(next.floor_table_id));
      setGuestNameDraft(next?.guest_name ? String(next.guest_name) : "");
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
    setBusy(true);
    try {
      const res = await resumeHotelCheck(row.id);
      const next = res?.check ?? row;
      setCheck(next);
      if (next?.floor_table_id) setSelectedTableId(String(next.floor_table_id));
      setGuestNameDraft(next?.guest_name ? String(next.guest_name) : "");
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
    if (collectPayment) {
      setPayError(null);
      if (offlineMode || isLocalHotelCheckId(check.id) || check.offline) {
        setOpenFolios([]);
        setPayOpen(true);
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
      setPayOpen(true);
      return;
    }
    void handleSaveOrder();
  }

  async function handlePaymentComplete({ payments, folio_id }) {
    if (!check?.id) return;
    setBusy(true);
    setPayError(null);
    try {
      const useLocal =
        offlineMode ||
        isLocalHotelCheckId(check.id) ||
        Boolean(check.offline) ||
        Boolean(check.offline_client_check_uuid);

      if (useLocal) {
        const methods = (payments ?? []).map((p) => String(p.method_code ?? "").toUpperCase());
        if (methods.some((m) => m && m !== "CASH")) {
          throw new Error(
            "Offline mode supports cash payments only. Reconnect for room charge or M-Pesa.",
          );
        }
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
          printSettings: checkPrintSettings,
        });
        notifySuccess(
          `Paid ${paid?.check_number ?? ""} — ${formatHotelMoney(paid?.total)} (pending sync)`,
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
          printSettings: checkPrintSettings,
        });
        notifySuccess(`Paid ${next?.check_number ?? ""} — ${formatHotelMoney(next?.total)}`);
        setPayOpen(false);
        await startFreshCheck();
      } else {
        await printCheckReceiptSafe(next, {
          title: "Partial payment",
          organization,
          printSettings: checkPrintSettings,
        });
        notifySuccess(
          `Partial payment on ${next?.check_number ?? ""} — balance ${formatHotelMoney(next?.balance_due)}`,
        );
        setCheck(next);
        setPayOpen(false);
      }
      void loadCatalog(debouncedSearch, { offset: 0, append: false });
    } catch (e) {
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

  async function bumpQty(line, delta) {
    if (!check?.id || !line?.id || busy) return;
    const nextQty = Number(line.qty) + delta;
    setBusy(true);
    try {
      if (offlineMode || isLocalHotelCheckId(check.id) || check.offline) {
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
  const emptyTicketHint =
    serviceMode === "room_service"
      ? "Enter room / guest, then tap a menu item"
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
              Hotel POS
            </p>
            {(menuOutlet?.name || menuOutlet?.menu_channel_label) ? (
              <p className="theme-subtext mt-0.5 truncate text-[11px] sm:text-xs">
                {[menuOutlet?.name, menuOutlet?.menu_channel_label ? `${menuOutlet.menu_channel_label} menu` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
          </div>
          <div className="hotel-pos-header-tools relative z-[60] flex shrink-0 items-center justify-end gap-1.5 justify-self-end sm:gap-2">
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
              className="hotel-pos-chip-scroll flex justify-center gap-2 overflow-x-auto pb-0.5"
              role="toolbar"
              aria-label="Menu filter"
            >
              {MENU_FILTER_CHIPS.map((chip) => (
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
              placeholder="Search item…"
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
              <p className="theme-subtext py-20 text-center text-sm">Loading menu…</p>
            ) : !products.length ? (
              <p className="theme-subtext py-20 text-center text-sm">
                {debouncedSearch ? "No products match your search." : "No products in catalogue yet."}
              </p>
            ) : (
              <>
                <div className="grid gap-3" style={gridStyle}>
                  {products.map((product) => {
                    const hasImage = Boolean(product.has_image || product.image_url);
                    return (
                      <button
                        key={product.product_code}
                        type="button"
                        disabled={busy}
                        onClick={() => void handleTapProduct(product)}
                        className="hotel-pos-tile group relative flex min-h-[7.5rem] flex-col overflow-hidden text-left transition duration-150 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50"
                      >
                        <div className="hotel-pos-tile-shine pointer-events-none absolute inset-x-0 top-0 h-1 opacity-0 transition group-hover:opacity-100" />
                        {hasImage ? (
                          <div className="hotel-pos-tile-media relative aspect-[4/3] w-full overflow-hidden bg-[var(--theme-surface-muted)]">
                            <EntityPhotoDisplay
                              fileUrl={productPhotoFileUrl(product.product_code)}
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
                        ) : null}
                        <div className="flex min-h-0 flex-1 flex-col justify-between gap-2 p-3.5">
                          <div className="flex items-start justify-between gap-2">
                            <span className="theme-heading line-clamp-2 text-[15px] font-semibold leading-snug">
                              {product.product_name}
                            </span>
                            {!hasImage && product.is_popular ? (
                              <span className="hotel-pos-top-badge shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                                Top
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-end justify-between gap-2">
                            <p className="text-base font-bold tabular-nums text-[var(--theme-accent-text)]">
                              {formatHotelMoney(product.unit_price)}
                            </p>
                            <span className="hotel-pos-add-chip rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide opacity-80 group-hover:opacity-100">
                              Add
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
            syncing={offlineSyncing}
            offlineMode={offlineMode}
            onSync={syncOfflineChecks}
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

            <div className="grid grid-cols-3 gap-1.5">
              {SERVICE_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={serviceMode === mode.id}
                  onClick={() => setServiceMode(mode.id)}
                  className={`hotel-pos-service-mode${
                    serviceMode === mode.id ? " hotel-pos-service-mode-active" : ""
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {showTableField ? (
                <div className={showGuestField || roomChargeEnabled ? undefined : "sm:col-span-2"}>
                  <label className="sr-only" htmlFor="hotel-pos-table-select">
                    Choose table
                  </label>
                  <select
                    id="hotel-pos-table-select"
                    ref={tableSelectRef}
                    className="theme-input hotel-pos-field w-full rounded-xl px-3 py-2.5 text-sm"
                    value={selectedTableId}
                    onChange={(e) => setSelectedTableId(e.target.value)}
                  >
                    <option value="">Choose table…</option>
                    {floorTables.map((table) => (
                      <option key={table.id} value={String(table.id)}>
                        {table.label || table.code}
                        {table.zone ? ` · ${table.zone}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {showGuestField ? (
                <div className={showTableField || roomChargeEnabled ? undefined : "sm:col-span-2"}>
                  <label className="sr-only" htmlFor="hotel-pos-guest-name">
                    {serviceMode === "room_service" ? "Room / guest" : "Guest name"}
                  </label>
                  <input
                    id="hotel-pos-guest-name"
                    type="text"
                    value={guestNameDraft}
                    onChange={(e) => setGuestNameDraft(e.target.value)}
                    placeholder={
                      serviceMode === "room_service"
                        ? "Room / guest (e.g. 101 — John)"
                        : "Guest name (optional)"
                    }
                    className="theme-input hotel-pos-field w-full rounded-xl px-3 py-2.5 text-sm"
                    autoComplete="off"
                    maxLength={160}
                  />
                </div>
              ) : null}
              {roomChargeEnabled ? (
                <div className={showTableField || showGuestField ? undefined : "sm:col-span-2"}>
                  <label className="sr-only" htmlFor="hotel-pos-order-type">
                    Order type
                  </label>
                  <select
                    id="hotel-pos-order-type"
                    className="theme-input hotel-pos-field w-full rounded-xl px-3 py-2.5 text-sm"
                    value={chargeToRoom ? "room" : "pay"}
                    onChange={(e) => setChargeToRoom(e.target.value === "room")}
                    disabled={!collectPayment}
                  >
                    <option value="pay">Collect payment</option>
                    <option value="room">Charge to room</option>
                  </select>
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
                            {formatHotelMoney(line.unit_price)} each
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <span className="text-sm font-bold tabular-nums">
                            {formatHotelMoney(line.line_total)}
                          </span>
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

            <div className="mb-2.5 grid grid-cols-3 gap-2">
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
              <PosActionButton
                label="Held"
                title="View held and unpaid checks"
                icon="☰"
                badge={heldCount}
                disabled={busy}
                onClick={() => void openCollectibleList()}
              />
            </div>

            {collectPayment ? (
              <button
                type="button"
                disabled={busy || !hasLines}
                onClick={() => void handlePrimaryComplete()}
                className="hotel-pos-primary-cta w-full rounded-xl py-3.5 text-sm font-bold uppercase tracking-wide disabled:opacity-40"
              >
                {primaryCtaLabel}
              </button>
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
              <h2 className="theme-heading text-base font-semibold">Unpaid &amp; partial</h2>
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
                <p className="theme-subtext px-3 py-8 text-center text-sm">No unpaid orders</p>
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
        onComplete={handlePaymentComplete}
      />
    </div>
  );
}
