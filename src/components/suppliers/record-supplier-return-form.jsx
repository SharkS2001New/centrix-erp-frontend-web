"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Field, inputClassName, formatShortDate } from "@/components/catalog/catalog-shared";
import { LpoProductSearchPanel } from "@/components/lpo/lpo-product-search-panel";
import { formatPackagingLabel, packageNameFromUom } from "@/components/lpo/lpo-product-utils";
import {
  formatPoNumber,
  lpoReturnableLines,
  lpoStockDeductQty,
  LPO_STATUS,
} from "@/components/lpo/lpo-shared";
import {
  DEFAULT_RETURN_DRAFT,
  PackageTypeField,
  REASON_SCOPE,
  STOCK_LOCATION,
  expandLinesForSubmit,
  formatStockLocationLabel,
  lpoReceivedLocationMeta,
  packagingLabelFromProduct,
  stockLocationSelectOptions,
} from "@/components/suppliers/supplier-return-shared";

const RETURN_MODES = {
  LPO: "lpo",
  MANUAL: "manual",
};

const EMPTY_LPO_LINES = [];

function newLineKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatLpoInvoiceLabel(inv) {
  const parts = [inv.number];
  if (inv.invoice_date) parts.push(formatShortDate(inv.invoice_date));
  if (inv.invoice_amount > 0) {
    parts.push(`KES ${Number(inv.invoice_amount).toLocaleString()}`);
  }
  return parts.join(" · ");
}

export function RecordSupplierReturnForm({
  initialSupplierId = null,
  initialLpoNo = null,
  initialMode = null,
  editDocumentId = null,
  onSuccess,
  backHref,
  backLabel,
  pageTitle = "Record supplier return",
  pageSubtitle = "Every return is tied to one supplier. Find products on the left, review lines on the right, then submit for approval.",
}) {
  const { user } = useAuth();
  const [mode, setMode] = useState(
    () => initialMode ?? (initialLpoNo ? RETURN_MODES.LPO : RETURN_MODES.MANUAL),
  );
  const [suppliers, setSuppliers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [vats, setVats] = useState([]);
  const [supplierId, setSupplierId] = useState(
    initialSupplierId != null ? String(initialSupplierId) : "",
  );
  const [branchId, setBranchId] = useState("");
  const [lpoNo, setLpoNo] = useState(initialLpoNo ? String(initialLpoNo) : "");
  const [lpoOptions, setLpoOptions] = useState([]);
  const [loadingLpos, setLoadingLpos] = useState(false);
  const [lpoSummary, setLpoSummary] = useState(null);
  const [loadingLpoSummary, setLoadingLpoSummary] = useState(false);
  const [lines, setLines] = useState([]);
  const [notes, setNotes] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [reasonScope, setReasonScope] = useState(REASON_SCOPE.ORDER);
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("");
  const [pendingManual, setPendingManual] = useState(null);
  const [pendingLpoLine, setPendingLpoLine] = useState(null);
  const [addDraft, setAddDraft] = useState({ ...DEFAULT_RETURN_DRAFT });
  const [stockHint, setStockHint] = useState(null);
  const [loadingStock, setLoadingStock] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [addError, setAddError] = useState(null);
  const [returnReasonError, setReturnReasonError] = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingDocument, setLoadingDocument] = useState(Boolean(editDocumentId));
  const [editStatus, setEditStatus] = useState(null);

  const uomById = useMemo(() => new Map(uoms.map((u) => [u.id, u])), [uoms]);
  const vatById = useMemo(() => new Map(vats.map((v) => [v.id, v])), [vats]);

  const lpoLines = useMemo(
    () => lpoSummary?.lines ?? EMPTY_LPO_LINES,
    [lpoSummary?.lines],
  );
  const returnableLines = useMemo(() => lpoReturnableLines(lpoLines), [lpoLines]);

  const lpoHasReceivedStock = useMemo(
    () => lpoLines.some((line) => Number(line.received_qty ?? 0) > 0),
    [lpoLines],
  );

  const lpoInvoiceChoices = useMemo(() => {
    const list = (lpoSummary?.supplier_invoices ?? []).filter(
      (inv) => !lpoNo || Number(inv.lpo_no) === Number(lpoNo),
    );
    const seen = new Set();
    const choices = [];
    for (const inv of list) {
      const number = String(inv.supplier_invoice_number ?? "").trim();
      if (!number || seen.has(number)) continue;
      seen.add(number);
      choices.push({
        id: inv.id ?? `recv-${number}`,
        number,
        invoice_date: inv.invoice_date ?? null,
        invoice_amount: Number(inv.invoice_amount ?? 0),
        source: inv.source ?? "invoice",
      });
    }
    return choices;
  }, [lpoSummary?.supplier_invoices, lpoNo]);

  const pendingLpoStockPreview = useMemo(() => {
    if (!pendingLpoLine) return null;
    const total = lpoStockDeductQty(pendingLpoLine, addDraft.quantity);
    if (total <= 0) return { total: 0 };
    return {
      total,
      location: addDraft.stock_location,
    };
  }, [pendingLpoLine, addDraft.quantity, addDraft.stock_location]);

  useEffect(() => {
    const bid = user?.branch_id;
    if (bid) setBranchId(String(bid));
    Promise.all([
      apiRequest("/suppliers", { searchParams: { per_page: 200 } }),
      apiRequest("/branches", { searchParams: { per_page: 50 } }),
      apiRequest("/uoms", { searchParams: { per_page: 200 } }).catch(() => ({ data: [] })),
      apiRequest("/vats", { searchParams: { per_page: 50 } }).catch(() => ({ data: [] })),
    ])
      .then(([supRes, branchRes, uomRes, vatRes]) => {
        setSuppliers(supRes.data ?? []);
        const branchList = branchRes.data ?? branchRes ?? [];
        setBranches(branchList);
        if (!bid && branchList.length === 1) setBranchId(String(branchList[0].id));
        setUoms(uomRes.data ?? []);
        setVats(vatRes.data ?? []);
      })
      .catch(() => {})
      .finally(() => setLoadingMeta(false));
  }, [user?.branch_id]);

  useEffect(() => {
    if (!editDocumentId) return;
    let cancelled = false;
    setLoadingDocument(true);
    apiRequest(`/supplier-return-documents/${editDocumentId}`)
      .then((res) => {
        if (cancelled) return;
        const doc = res.data ?? res;
        if (!doc.can_edit) {
          setFormError("You cannot edit this return.");
          return;
        }
        setEditStatus(doc.status ?? null);
        setMode(doc.source_type === RETURN_MODES.LPO ? RETURN_MODES.LPO : RETURN_MODES.MANUAL);
        setSupplierId(String(doc.supplier_id));
        setBranchId(String(doc.branch_id));
        setLpoNo(doc.lpo_no ? String(doc.lpo_no) : "");
        setSupplierInvoiceNo(doc.supplier_invoice_no ?? "");
        setReasonScope(doc.reason_scope ?? REASON_SCOPE.ORDER);
        const docReason = (doc.return_reason ?? doc.notes ?? "").trim();
        setReturnReason(docReason);
        setNotes(doc.notes ?? "");
        setLines(
          (doc.lines ?? []).map((line) => ({
            key: newLineKey(),
            product_code: line.product_code,
            product_name: line.product_name,
            quantity: String(line.quantity),
            package_type: line.package_type === "partial" ? "pieces" : line.package_type,
            stock_location: line.stock_location ?? STOCK_LOCATION.STORE,
            reason: line.reason ?? "",
            uom_label: line.uom_label,
            packaging_label: line.package_type_label ?? line.uom_label,
          })),
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setFormError(err instanceof ApiError ? err.message : "Failed to load return");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDocument(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editDocumentId]);

  const loadLpoOptions = useCallback(async (sid) => {
    if (!sid) {
      setLpoOptions([]);
      return;
    }
    setLoadingLpos(true);
    try {
      const res = await apiRequest("/lpo-mst", {
        searchParams: { supplier_id: sid, per_page: 100 },
      });
      const list = (res.data ?? []).filter(
        (l) => Number(l.lpo_status_code) >= LPO_STATUS.AWAITING_RECEIVE,
      );
      setLpoOptions(list);
    } catch {
      setLpoOptions([]);
    } finally {
      setLoadingLpos(false);
    }
  }, []);

  useEffect(() => {
    if (mode !== RETURN_MODES.LPO) return;
    loadLpoOptions(supplierId);
  }, [mode, supplierId, loadLpoOptions]);

  useEffect(() => {
    if (mode !== RETURN_MODES.LPO || !lpoNo) return;
    let cancelled = false;
    setLoadingLpoSummary(true);
    apiRequest(`/lpo-mst/${lpoNo}/summary`)
      .then((res) => {
        if (!cancelled) {
          setLpoSummary(res);
          if (res.lpo?.supplier_id) setSupplierId(String(res.lpo.supplier_id));
        }
      })
      .catch(() => {
        if (!cancelled) setLpoSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingLpoSummary(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, lpoNo]);

  useEffect(() => {
    if (mode !== RETURN_MODES.LPO || !lpoNo || loadingLpoSummary) return;

    if (!lpoHasReceivedStock) {
      setSupplierInvoiceNo("");
      return;
    }

    if (lpoInvoiceChoices.length === 1) {
      setSupplierInvoiceNo(lpoInvoiceChoices[0].number);
      return;
    }

    if (lpoInvoiceChoices.length > 1) {
      setSupplierInvoiceNo((prev) =>
        prev && lpoInvoiceChoices.some((c) => c.number === prev) ? prev : "",
      );
      return;
    }

    const headerInv = lpoSummary?.lpo?.supplier_invoice_no;
    setSupplierInvoiceNo(headerInv ? String(headerInv) : "");
  }, [
    mode,
    lpoNo,
    loadingLpoSummary,
    lpoHasReceivedStock,
    lpoInvoiceChoices,
    lpoSummary?.lpo?.supplier_invoice_no,
  ]);

  const pendingPackagingLabel = useMemo(() => {
    if (pendingManual) return packagingLabelFromProduct(pendingManual, uomById);
    if (pendingLpoLine) {
      return pendingLpoLine.packaging_label || pendingLpoLine.uom || "package";
    }
    return "package";
  }, [pendingManual, pendingLpoLine, uomById]);

  useEffect(() => {
    const productCode = pendingManual?.product_code ?? pendingLpoLine?.product_code;
    if (!productCode || !branchId) {
      setStockHint(null);
      return;
    }
    let cancelled = false;
    setLoadingStock(true);
    apiRequest("/current-stock", {
      searchParams: {
        per_page: 1,
        "filter[product_code]": productCode,
        "filter[branch_id]": branchId,
      },
    })
      .then((res) => {
        if (cancelled) return;
        const row = (res.data ?? [])[0];
        setStockHint({
          shop: Number(row?.shop_quantity ?? pendingManual?.stock_in_shop ?? 0),
          store: Number(row?.store_quantity ?? pendingManual?.stock_in_store ?? 0),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setStockHint({
            shop: Number(pendingManual?.stock_in_shop ?? 0),
            store: Number(pendingManual?.stock_in_store ?? 0),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingStock(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pendingManual, pendingLpoLine, branchId]);

  function switchMode(next) {
    setMode(next);
    setFormError(null);
    setAddError(null);
    setReturnReasonError(null);
    setLines([]);
    setNotes("");
    setReturnReason("");
    setSupplierInvoiceNo("");
    setReasonScope(REASON_SCOPE.ORDER);
    setPendingManual(null);
    setPendingLpoLine(null);
    setAddDraft({ ...DEFAULT_RETURN_DRAFT });
    setLpoSummary(null);
    if (next === RETURN_MODES.MANUAL) {
      setLpoNo(initialLpoNo ? String(initialLpoNo) : "");
    }
  }

  function selectManualProduct(product) {
    if (lines.some((l) => l.product_code === product.product_code)) {
      setAddError(`${product.product_name} is already on this return. Edit the existing line or remove it first.`);
      setPendingManual(null);
      setPendingLpoLine(null);
      return;
    }
    setPendingManual(product);
    setPendingLpoLine(null);
    setAddDraft({
      ...DEFAULT_RETURN_DRAFT,
      reason: reasonScope === REASON_SCOPE.ORDER ? returnReason : "",
    });
    setFormError(null);
    setAddError(null);
    setReturnReasonError(null);
  }

  function selectLpoLine(line) {
    if (lines.some((l) => l.product_code === line.product_code)) {
      setAddError(`${line.product_name} is already on this return. Edit the existing line or remove it first.`);
      setPendingManual(null);
      setPendingLpoLine(null);
      return;
    }
    setPendingLpoLine(line);
    setPendingManual(null);
    const { primary } = lpoReceivedLocationMeta(line);
    setAddDraft({
      ...DEFAULT_RETURN_DRAFT,
      quantity: String(Math.min(1, Number(line.max_return_qty ?? 1))),
      stock_location: primary,
      reason: reasonScope === REASON_SCOPE.ORDER ? returnReason : "",
    });
    setFormError(null);
    setAddError(null);
    setReturnReasonError(null);
  }

  function buildLineFromPending({ product_code, product_name, uom_label, packaging_label, extras, lineReason }) {
    const qty = Number(addDraft.quantity);
    const shopAvail = stockHint?.shop ?? 0;
    const storeAvail = stockHint?.store ?? 0;

    if (mode === RETURN_MODES.MANUAL) {
      const at =
        addDraft.stock_location === STOCK_LOCATION.SHOP ? shopAvail : storeAvail;
      if (qty > at + 0.0001) {
        setAddError(`Quantity exceeds ${formatStockLocationLabel(addDraft.stock_location)} stock (${at}).`);
        return null;
      }
    }

    return {
      key: newLineKey(),
      product_code,
      product_name,
      quantity: String(qty),
      package_type: addDraft.package_type,
      stock_location: addDraft.stock_location,
      uom_label,
      packaging_label,
      reason: lineReason,
      ...extras,
    };
  }

  function addPendingToLines() {
    const qty = Number(addDraft.quantity);
    const lineReason =
      reasonScope === REASON_SCOPE.PER_PRODUCT ? addDraft.reason.trim() : returnReason.trim();
    setAddError(null);
    setFormError(null);
    if (!qty || qty <= 0) {
      setAddError("Enter a quantity to return before adding the line.");
      return;
    }
    if (reasonScope === REASON_SCOPE.PER_PRODUCT && lineReason.length < 3) {
      setAddError("Return reason is required for this product (at least 3 characters).");
      return;
    }
    if (reasonScope === REASON_SCOPE.ORDER && returnReason.trim().length < 3) {
      setReturnReasonError("Return reason is required (at least 3 characters).");
      setAddError(null);
      return;
    }

    const pendingCode = pendingManual?.product_code ?? pendingLpoLine?.product_code;
    if (pendingCode && lines.some((l) => l.product_code === pendingCode)) {
      setAddError("This product is already on the return. Use one line per product — edit packaging or qty on the existing line.");
      return;
    }

    if (pendingManual) {
      const line = buildLineFromPending({
        product_code: pendingManual.product_code,
        product_name: pendingManual.product_name,
        uom_label: pendingManual.package_name ?? packageNameFromUom(pendingManual.uom),
        packaging_label: packagingLabelFromProduct(pendingManual, uomById),
        extras: {},
        lineReason: reasonScope === REASON_SCOPE.PER_PRODUCT ? lineReason : "",
      });
      if (!line) return;
      setLines((prev) => [...prev, line]);
      setPendingManual(null);
    } else if (pendingLpoLine) {
      const max = Number(pendingLpoLine.max_return_qty ?? 0);
      if (qty > max + 0.0001) {
        setAddError(`Quantity cannot exceed ${max} for this LPO line.`);
        return;
      }
      const line = buildLineFromPending({
        product_code: pendingLpoLine.product_code,
        product_name: pendingLpoLine.product_name,
        uom_label: pendingLpoLine.uom ?? pendingLpoLine.package_name,
        packaging_label: pendingLpoLine.packaging_label || pendingLpoLine.uom,
        extras: {
          max_return_qty: pendingLpoLine.max_return_qty,
          received_qty: pendingLpoLine.received_qty,
          ordered_qty: pendingLpoLine.ordered_qty,
          received_stock_location: pendingLpoLine.received_stock_location,
          received_location_options: pendingLpoLine.received_location_options,
          received_qty_by_location: pendingLpoLine.received_qty_by_location,
        },
        lineReason: reasonScope === REASON_SCOPE.PER_PRODUCT ? lineReason : "",
      });
      if (!line) return;
      setLines((prev) => [...prev, line]);
      setPendingLpoLine(null);
    } else {
      setAddError("Select a product to add.");
      return;
    }

    setAddDraft({
      ...DEFAULT_RETURN_DRAFT,
      reason: reasonScope === REASON_SCOPE.ORDER ? returnReason : "",
    });
    setFormError(null);
    setAddError(null);
    setReturnReasonError(null);
  }

  function updateLine(key, patch) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }

  function removeLine(key) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function validateReturnForm() {
    if (!supplierId) {
      return { ok: false, formError: "Select a supplier.", returnReasonError: null };
    }
    if (!branchId) {
      return { ok: false, formError: "Select a branch.", returnReasonError: null };
    }
    if (mode === RETURN_MODES.LPO && !lpoNo) {
      return { ok: false, formError: "Select a purchase order.", returnReasonError: null };
    }
    if (
      mode === RETURN_MODES.LPO &&
      lpoHasReceivedStock &&
      lpoInvoiceChoices.length > 1 &&
      !supplierInvoiceNo.trim()
    ) {
      return {
        ok: false,
        formError: "Select the supplier invoice for this return.",
        returnReasonError: null,
      };
    }
    if (reasonScope === REASON_SCOPE.ORDER && returnReason.trim().length < 3) {
      return {
        ok: false,
        formError: null,
        returnReasonError: "Return reason is required (at least 3 characters).",
      };
    }
    if (lines.length === 0) {
      return { ok: false, formError: "Add at least one product to this return.", returnReasonError: null };
    }

    const productCodes = lines.map((l) => l.product_code);
    if (new Set(productCodes).size !== productCodes.length) {
      return {
        ok: false,
        formError: "Each product can only appear once on this return. Remove duplicate lines or edit the existing line.",
        returnReasonError: null,
      };
    }

    for (const line of lines) {
      const qty = Number(line.quantity);
      if (!qty || qty <= 0) {
        return {
          ok: false,
          formError: "Each line needs a quantity greater than zero.",
          returnReasonError: null,
        };
      }
      if (
        reasonScope === REASON_SCOPE.PER_PRODUCT &&
        (line.reason ?? "").trim().length < 3
      ) {
        return {
          ok: false,
          formError: `${line.product_name}: return reason is required (at least 3 characters).`,
          returnReasonError: null,
        };
      }
      if (
        mode === RETURN_MODES.LPO &&
        line.max_return_qty != null &&
        qty > Number(line.max_return_qty) + 0.0001
      ) {
        return {
          ok: false,
          formError: `${line.product_name}: quantity exceeds max returnable on the LPO.`,
          returnReasonError: null,
        };
      }
    }

    return { ok: true, formError: null, returnReasonError: null };
  }

  const canSubmit = useMemo(() => {
    if (!supplierId || !branchId || lines.length === 0) return false;
    if (mode === RETURN_MODES.LPO && !lpoNo) return false;
    if (
      mode === RETURN_MODES.LPO &&
      lpoHasReceivedStock &&
      lpoInvoiceChoices.length > 1 &&
      !supplierInvoiceNo.trim()
    ) {
      return false;
    }
    if (reasonScope === REASON_SCOPE.ORDER) {
      return returnReason.trim().length >= 3;
    }
    return lines.every((line) => (line.reason ?? "").trim().length >= 3);
  }, [
    supplierId,
    branchId,
    lines,
    mode,
    lpoNo,
    lpoHasReceivedStock,
    lpoInvoiceChoices.length,
    supplierInvoiceNo,
    reasonScope,
    returnReason,
  ]);

  const reasonScopeLocked = lines.length > 0;

  const addedProductCodes = useMemo(
    () => new Set(lines.map((l) => l.product_code)),
    [lines],
  );

  async function submit(e) {
    e.preventDefault();
    const validation = validateReturnForm();
    if (!validation.ok) {
      setFormError(validation.formError);
      setReturnReasonError(validation.returnReasonError);
      return;
    }
    setFormError(null);
    setReturnReasonError(null);

    const docNotes =
      reasonScope === REASON_SCOPE.ORDER
        ? returnReason.trim()
        : notes.trim() ||
          lines
            .map((l) => (l.reason ?? "").trim())
            .filter(Boolean)
            .join("; ");

    const apiLines = expandLinesForSubmit(lines, reasonScope, docNotes);
    if (apiLines.length === 0) {
      setFormError("Add at least one product line with quantity to return.");
      return;
    }
    if (docNotes.length < 3) {
      setReturnReasonError("Return reason is required (at least 3 characters).");
      return;
    }

    setSaving(true);
    setFormError(null);
    setAddError(null);
    setReturnReasonError(null);
    try {
      const payload = {
        supplier_id: Number(supplierId),
        branch_id: Number(branchId),
        source_type: mode,
        lpo_no: mode === RETURN_MODES.LPO ? Number(lpoNo) : null,
        supplier_invoice_no: supplierInvoiceNo.trim() || null,
        reason_scope: reasonScope,
        return_reason: docNotes,
        notes: docNotes,
        lines: apiLines,
      };

      if (editDocumentId) {
        await apiRequest(`/supplier-return-documents/${editDocumentId}`, {
          method: "PUT",
          body: payload,
        });
      } else {
        await apiRequest("/supplier-return-documents", {
          method: "POST",
          body: payload,
        });
      }
      await onSuccess?.();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Return failed");
    } finally {
      setSaving(false);
    }
  }

  const lpoStatusCode = lpoSummary?.lpo?.lpo_status_code ?? 0;
  const showLpoProductPicker =
    mode === RETURN_MODES.LPO &&
    lpoNo &&
    Number(lpoStatusCode) >= LPO_STATUS.AWAITING_RECEIVE &&
    returnableLines.length > 0;

  const RETURN_TABS = [
    { id: RETURN_MODES.LPO, label: "From purchase order (LPO)" },
    { id: RETURN_MODES.MANUAL, label: "Manual / legacy stock" },
  ];


  function PendingAddBar({ title, subtitle }) {
    const lpoLocMeta =
      mode === RETURN_MODES.LPO && pendingLpoLine
        ? lpoReceivedLocationMeta(pendingLpoLine)
        : null;
    const locationOptions = stockLocationSelectOptions({
      mode,
      lpoLine: pendingLpoLine,
      manual: mode === RETURN_MODES.MANUAL,
    });

    return (
      <div className="relative z-20 rounded-lg border border-[#185FA5]/30 bg-[#E6F1FB]/40 p-4 shadow-sm">
        <p className="text-sm font-medium text-slate-900">{title}</p>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-600">{subtitle}</p> : null}
        <p className="mt-1 text-[11px] text-slate-500">
          Stock unit: <span className="font-medium text-slate-700">{pendingPackagingLabel}</span>
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Qty to return">
            <input
              type="number"
              min="0"
              step="any"
              className={inputClassName()}
              value={addDraft.quantity}
              onChange={(e) => setAddDraft((d) => ({ ...d, quantity: e.target.value }))}
            />
          </Field>
          <Field label="Return from">
            {lpoLocMeta?.locked ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                {formatStockLocationLabel(addDraft.stock_location)}
                <span className="mt-0.5 block text-xs font-normal text-slate-500">
                  LPO stock was received into this location
                </span>
              </p>
            ) : (
              <select
                className={inputClassName()}
                value={addDraft.stock_location}
                onChange={(e) => setAddDraft((d) => ({ ...d, stock_location: e.target.value }))}
              >
                {locationOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className="sm:col-span-2">
            <PackageTypeField
              idPrefix="pending-add"
              packagingLabel={pendingPackagingLabel}
              value={addDraft.package_type}
              onChange={(v) => setAddDraft((d) => ({ ...d, package_type: v }))}
            />
          </div>
          {reasonScope === REASON_SCOPE.PER_PRODUCT ? (
            <div className="sm:col-span-2">
              <Field label="Reason for this product (required)">
                <textarea
                  rows={2}
                  autoComplete="off"
                  required
                  minLength={3}
                  className={inputClassName()}
                  value={addDraft.reason}
                  onChange={(e) => setAddDraft((d) => ({ ...d, reason: e.target.value }))}
                  placeholder="e.g. Damaged packs, expired batch"
                />
              </Field>
            </div>
          ) : null}
        </div>
        {loadingStock ? (
          <p className="mt-2 text-xs text-slate-500">Loading branch stock…</p>
        ) : null}
        {stockHint ? (
          <p className="mt-2 text-xs text-slate-500">
            Branch stock — shop: {stockHint.shop}, store: {stockHint.store}
            {mode === RETURN_MODES.MANUAL && addDraft.stock_location === STOCK_LOCATION.SHOP ? (
              <> · returning from shop</>
            ) : mode === RETURN_MODES.MANUAL && addDraft.stock_location === STOCK_LOCATION.STORE ? (
              <> · returning from store</>
            ) : null}
          </p>
        ) : null}
        {mode === RETURN_MODES.LPO && pendingLpoLine && lpoLocMeta && (lpoLocMeta.shop > 0 || lpoLocMeta.store > 0) ? (
          <p className="mt-2 text-xs text-slate-500">
            Received on this LPO — shop: {lpoLocMeta.shop}, store: {lpoLocMeta.store} (base units)
          </p>
        ) : null}
        {mode === RETURN_MODES.LPO && pendingLpoStockPreview != null ? (
          <p className="mt-2 text-xs text-slate-500">
            {pendingLpoStockPreview.total > 0 ? (
              <>
                {pendingLpoStockPreview.total} pack(s) from{" "}
                {formatStockLocationLabel(pendingLpoStockPreview.location)} when approved
              </>
            ) : (
              "No stock deduction on approval — qty exceeds received on the LPO."
            )}
          </p>
        ) : null}
        {addError ? (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{addError}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addPendingToLines}
            className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a]"
          >
            Add to return
          </button>
          <button
            type="button"
            onClick={() => {
              setPendingManual(null);
              setPendingLpoLine(null);
              setAddDraft({
                ...DEFAULT_RETURN_DRAFT,
                reason: reasonScope === REASON_SCOPE.ORDER ? returnReason : "",
              });
            }}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="-m-6 flex min-h-[calc(100%+3rem)] w-full flex-col bg-slate-50 p-6 text-slate-900 md:-m-8 md:min-h-[calc(100%+4rem)] md:p-8">
      <div className="mb-4 shrink-0">
        <Link href={backHref} className="text-sm text-[#185FA5] hover:text-[#144f8a]">
          {backLabel}
        </Link>
        <h1 className="mt-2 text-xl font-medium text-slate-900">{pageTitle}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">{pageSubtitle}</p>
      </div>

      {loadingMeta || loadingDocument ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
          {!editDocumentId ? (
          <div className="flex shrink-0 flex-wrap gap-1 border-b border-slate-200 px-4 pt-3">
            {RETURN_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => switchMode(t.id)}
                className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
                  mode === t.id
                    ? "border border-b-white border-slate-200 bg-white text-[#185FA5]"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          ) : null}

          <form
            noValidate
            onSubmit={submit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
                e.preventDefault();
              }
            }}
            className="flex min-h-0 flex-1 flex-col p-5 md:p-6"
          >
            {editStatus === "approved" ? (
              <p className="mb-4 shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                This return is already approved. Saving changes will reverse the previous stock
                deduction and apply the updated quantities.
              </p>
            ) : null}
            <p className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Every return is tied to one supplier. Choose Shop or Store — stock is deducted from
              that location only. LPO returns use the location where stock was received on the PO.
            </p>

            <div className="grid shrink-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Supplier (required)">
                <select
                  className={inputClassName()}
                  value={supplierId}
                  onChange={(e) => {
                    setSupplierId(e.target.value);
                    if (!initialLpoNo) setLpoNo("");
                    setLpoSummary(null);
                    setLines([]);
                    setSupplierInvoiceNo("");
                  }}
                  required
                  disabled={mode === RETURN_MODES.LPO && Boolean(initialLpoNo)}
                >
                  <option value="">Select supplier</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.supplier_name}
                    </option>
                  ))}
                </select>
              </Field>

              {mode === RETURN_MODES.LPO ? (
                <Field label="Purchase order">
                  <select
                    className={inputClassName()}
                    value={lpoNo}
                    onChange={(e) => {
                      setLpoNo(e.target.value);
                      setLines([]);
                      setSupplierInvoiceNo("");
                    }}
                    required
                    disabled={!supplierId || loadingLpos || Boolean(initialLpoNo)}
                  >
                    <option value="">
                      {loadingLpos ? "Loading LPOs…" : "Select LPO"}
                    </option>
                    {lpoOptions.map((l) => (
                      <option key={l.lpo_no} value={String(l.lpo_no)}>
                        {formatPoNumber(l.lpo_no)} — {l.status_name ?? `Status ${l.lpo_status_code}`}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}

              <Field label="Branch">
                <select
                  className={inputClassName()}
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  required
                >
                  <option value="">Select branch</option>
                  {branches.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.branch_name}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="min-w-0">
                {mode === RETURN_MODES.LPO && lpoNo && lpoHasReceivedStock ? (
                  lpoInvoiceChoices.length > 1 ? (
                    <Field label="Supplier inv. no. (required)">
                      <select
                        className={inputClassName()}
                        value={supplierInvoiceNo}
                        onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                        required
                      >
                        <option value="">Select supplier invoice</option>
                        {lpoInvoiceChoices.map((inv) => (
                          <option key={inv.id} value={inv.number}>
                            {formatLpoInvoiceLabel(inv)}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Invoices recorded when stock was received on this LPO. Pick the one this
                        return relates to.
                      </p>
                    </Field>
                  ) : lpoInvoiceChoices.length === 1 ? (
                    <Field label="Supplier inv. no.">
                      <input
                        type="text"
                        readOnly
                        disabled
                        className={`${inputClassName()} cursor-not-allowed bg-slate-100 text-slate-700`}
                        value={supplierInvoiceNo}
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        From receipt on this LPO — {formatLpoInvoiceLabel(lpoInvoiceChoices[0])}
                      </p>
                    </Field>
                  ) : (
                    <Field label="Supplier inv. no.">
                      <input
                        type="text"
                        className={`${inputClassName()} min-w-0`}
                        value={supplierInvoiceNo}
                        onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                        maxLength={120}
                        placeholder="No invoice on receipt — enter if known"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        No supplier invoice was saved when this LPO was received. Enter one if you
                        have it.
                      </p>
                    </Field>
                  )
                ) : (
                  <Field label="Supplier inv. no.">
                    <input
                      type="text"
                      className={`${inputClassName()} min-w-0`}
                      value={supplierInvoiceNo}
                      onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                      maxLength={120}
                      placeholder={
                        mode === RETURN_MODES.LPO && lpoNo
                          ? "Available after stock is received"
                          : "Invoice reference (optional)"
                      }
                      disabled={mode === RETURN_MODES.LPO && Boolean(lpoNo) && !lpoHasReceivedStock}
                    />
                    {mode === RETURN_MODES.LPO && lpoNo && !lpoHasReceivedStock ? (
                      <p className="mt-1 text-[11px] text-slate-500">
                        Receive stock on this LPO first — saved supplier invoices will appear here.
                      </p>
                    ) : null}
                  </Field>
                )}
              </div>
            </div>

            {mode === RETURN_MODES.LPO && lpoNo && loadingLpoSummary ? (
              <p className="mt-4 text-sm text-slate-500">Loading LPO lines…</p>
            ) : null}

            {mode === RETURN_MODES.LPO && lpoNo && !loadingLpoSummary && Number(lpoStatusCode) < LPO_STATUS.AWAITING_RECEIVE ? (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                This LPO must be sent to the supplier before you can record returns.
              </p>
            ) : null}

            {mode === RETURN_MODES.LPO && lpoNo && !loadingLpoSummary && Number(lpoStatusCode) >= LPO_STATUS.AWAITING_RECEIVE && returnableLines.length === 0 ? (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                All lines on this LPO are fully returned, or nothing remains to return.
              </p>
            ) : null}

            <div className="mt-4 grid min-h-0 flex-1 gap-6 border-t border-slate-100 pt-4 lg:grid-cols-12">
              <div className="relative flex min-h-0 flex-col gap-4 overflow-visible lg:col-span-5 lg:border-r lg:border-slate-100 lg:pr-6">
                <div className="relative z-0">
                  <p className="mb-2 text-sm font-semibold text-slate-800">
                    {mode === RETURN_MODES.LPO ? "Add products from LPO" : "Find product"}
                  </p>
                  {mode === RETURN_MODES.MANUAL && !branchId ? (
                    <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      Select a branch before searching for products.
                    </p>
                  ) : null}

                  {mode === RETURN_MODES.MANUAL ? (
                    <LpoProductSearchPanel
                      uomById={uomById}
                      vatById={vatById}
                      onSelect={selectManualProduct}
                      actionLabel="Choose product"
                      disabled={!branchId}
                      compactHalfPage
                      clearOnSelect={false}
                    />
                  ) : showLpoProductPicker ? (
                    <div className="overflow-hidden rounded-lg border border-slate-300 bg-white">
                      <div className="max-h-[min(50vh,440px)] overflow-auto">
                        <table className="w-full border-collapse text-xs">
                          <thead className="sticky top-0 z-10 bg-slate-100">
                            <tr className="text-left font-semibold text-slate-600">
                              <th className="px-2 py-2">Product</th>
                              <th className="px-2 py-2 text-right">Ord</th>
                              <th className="px-2 py-2 text-right">Rcvd</th>
                              <th className="px-2 py-2 text-right">Max</th>
                              <th className="px-2 py-2" />
                            </tr>
                          </thead>
                          <tbody>
                            {returnableLines.map((line) => {
                              const alreadyAdded = addedProductCodes.has(line.product_code);
                              return (
                              <tr
                                key={line.id ?? line.product_code}
                                className={`border-b border-slate-100 ${alreadyAdded ? "bg-slate-50/80" : "hover:bg-slate-50"}`}
                              >
                                <td className="px-2 py-2">
                                  <span className="font-medium text-slate-900">
                                    {line.product_name}
                                  </span>
                                  <span className="block font-mono text-[10px] text-slate-500">
                                    {line.product_code}
                                  </span>
                                </td>
                                <td className="px-2 py-2 text-right">{line.ordered_qty}</td>
                                <td className="px-2 py-2 text-right">{line.received_qty}</td>
                                <td className="px-2 py-2 text-right font-medium">
                                  {line.max_return_qty ?? line.returnable_qty}
                                </td>
                                <td className="px-2 py-2 text-right">
                                  {alreadyAdded ? (
                                    <span className="text-[11px] font-medium text-slate-400">Added</span>
                                  ) : (
                                  <button
                                    type="button"
                                    onClick={() => selectLpoLine(line)}
                                    className="text-[#185FA5] hover:underline"
                                  >
                                    Choose
                                  </button>
                                  )}
                                </td>
                              </tr>
                            );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : mode === RETURN_MODES.LPO ? (
                    <p className="text-sm text-slate-500">
                      Select a supplier and LPO to add return lines.
                    </p>
                  ) : null}
                </div>

                {pendingManual ? (
                  <PendingAddBar
                    title={pendingManual.product_name}
                    subtitle={`${pendingManual.product_code} · ${formatPackagingLabel(pendingManual.uom)}`}
                  />
                ) : null}

                {pendingLpoLine ? (
                  <PendingAddBar
                    title={pendingLpoLine.product_name}
                    subtitle={`Received ${pendingLpoLine.received_qty} of ${pendingLpoLine.ordered_qty} · max return ${pendingLpoLine.max_return_qty}`}
                  />
                ) : null}

                {addError && !pendingManual && !pendingLpoLine ? (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{addError}</p>
                ) : null}

                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                  <p className="text-sm font-semibold text-slate-800">Return reason (required)</p>
                  {reasonScopeLocked ? (
                    <p className="text-xs text-slate-500">
                      {reasonScope === REASON_SCOPE.ORDER
                        ? "Same reason for whole order — locked after adding the first product. Remove all items to change."
                        : "Per product — locked after adding the first product. Remove all items to change."}
                    </p>
                  ) : null}
                  <div className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:gap-4">
                    <label
                      className={`flex items-center gap-2 ${reasonScopeLocked ? "cursor-not-allowed text-slate-500" : "cursor-pointer"}`}
                    >
                      <input
                        type="radio"
                        name="reason_scope"
                        checked={reasonScope === REASON_SCOPE.ORDER}
                        disabled={reasonScopeLocked}
                        onChange={() => {
                          if (reasonScopeLocked) return;
                          setReasonScope(REASON_SCOPE.ORDER);
                          setReturnReasonError(null);
                          setAddError(null);
                        }}
                      />
                      Same reason for whole order
                    </label>
                    <label
                      className={`flex items-center gap-2 ${reasonScopeLocked ? "cursor-not-allowed text-slate-500" : "cursor-pointer"}`}
                    >
                      <input
                        type="radio"
                        name="reason_scope"
                        checked={reasonScope === REASON_SCOPE.PER_PRODUCT}
                        disabled={reasonScopeLocked}
                        onChange={() => {
                          if (reasonScopeLocked) return;
                          setReasonScope(REASON_SCOPE.PER_PRODUCT);
                          setReturnReasonError(null);
                          setAddError(null);
                        }}
                      />
                      Per product
                    </label>
                  </div>
                  {reasonScope === REASON_SCOPE.ORDER ? (
                    <Field label="Reason to return (required)">
                      <textarea
                        rows={2}
                        autoComplete="off"
                        required
                        minLength={3}
                        disabled={reasonScopeLocked}
                        className={`${inputClassName()} ${returnReasonError ? "border-red-300 focus:border-red-400 focus:ring-red-200" : ""} ${reasonScopeLocked ? "cursor-not-allowed bg-slate-100 text-slate-700" : ""}`}
                        value={returnReason}
                        onChange={(e) => {
                          if (reasonScopeLocked) return;
                          setReturnReason(e.target.value);
                          if (returnReasonError) setReturnReasonError(null);
                        }}
                        placeholder="Required — e.g. damaged delivery, wrong goods"
                      />
                      {returnReasonError ? (
                        <p className="mt-1 text-xs text-red-600">{returnReasonError}</p>
                      ) : null}
                    </Field>
                  ) : (
                    <p className="text-xs text-slate-500">
                      A reason is required for each product when adding lines and in the list on the
                      right.
                    </p>
                  )}
                  {reasonScope === REASON_SCOPE.PER_PRODUCT ? (
                    <Field label="Overall notes (optional)">
                      <textarea
                        rows={2}
                        className={inputClassName()}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Optional summary for approvers"
                      />
                    </Field>
                  ) : null}
                </div>

                <div className="mt-auto space-y-3 border-t border-slate-100 pt-4">
                  <p className="text-xs text-slate-500">
                    Submitted returns stay pending until a senior user approves them. Stock is only
                    adjusted after approval.
                  </p>

                  {formError ? (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={backHref}
                      className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </Link>
                    <button
                      type="submit"
                      disabled={saving || !canSubmit}
                      title={
                        !canSubmit
                          ? reasonScope === REASON_SCOPE.ORDER && returnReason.trim().length < 3
                            ? "Enter a return reason (at least 3 characters) before submitting"
                            : "Complete all required fields before submitting"
                          : undefined
                      }
                      className="rounded-lg bg-orange-600 px-5 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving
                        ? "Saving…"
                        : editDocumentId
                          ? "Save changes"
                          : "Submit for approval"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 flex-col lg:col-span-7">
                <p className="mb-2 text-sm font-semibold text-slate-800">
                  Items on this return ({lines.length})
                </p>

                {lines.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    No items yet. Choose a product on the left, set qty to return and location,
                    then click &quot;Add to return&quot;.
                    {reasonScope === REASON_SCOPE.PER_PRODUCT
                      ? " Add a reason per product when using different reasons."
                      : null}
                  </p>
                ) : (
                  <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-200">
                    <div className="max-h-[min(58vh,520px)] overflow-auto">
                      <ul className="divide-y divide-slate-100">
                        {lines.map((line) => {
                          const stockPreview =
                            mode === RETURN_MODES.LPO && line.received_qty != null
                              ? lpoStockDeductQty(line, line.quantity)
                              : null;
                          return (
                            <li key={line.key} className="p-4">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-slate-900">{line.product_name}</p>
                                  <p className="font-mono text-xs text-slate-500">{line.product_code}</p>
                                  {stockPreview != null ? (
                                    <p className="mt-0.5 text-[11px] text-slate-500">
                                      {stockPreview > 0
                                        ? `${stockPreview} pack(s) from stock when approved`
                                        : "No stock deduction when approved"}
                                    </p>
                                  ) : null}
                                  {line.max_return_qty != null ? (
                                    <p className="text-[11px] text-slate-500">
                                      Max {line.max_return_qty} on LPO
                                    </p>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeLine(line.key)}
                                  className="shrink-0 text-sm font-medium text-red-600 hover:underline"
                                >
                                  Remove
                                </button>
                              </div>
                              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <Field label="Qty to return">
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    className={inputClassName()}
                                    value={line.quantity}
                                    onChange={(e) =>
                                      updateLine(line.key, { quantity: e.target.value })
                                    }
                                  />
                                </Field>
                                <Field label="Return from">
                                  {(() => {
                                    const lineLocMeta =
                                      mode === RETURN_MODES.LPO
                                        ? lpoReceivedLocationMeta(line)
                                        : null;
                                    const lineOptions = stockLocationSelectOptions({
                                      mode,
                                      lpoLine: line,
                                      manual: mode === RETURN_MODES.MANUAL,
                                    });
                                    if (lineLocMeta?.locked) {
                                      return (
                                        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                                          {formatStockLocationLabel(line.stock_location)}
                                        </p>
                                      );
                                    }
                                    return (
                                      <select
                                        className={inputClassName()}
                                        value={line.stock_location}
                                        onChange={(e) =>
                                          updateLine(line.key, { stock_location: e.target.value })
                                        }
                                      >
                                        {lineOptions.map((opt) => (
                                          <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                          </option>
                                        ))}
                                      </select>
                                    );
                                  })()}
                                </Field>
                                <div className="sm:col-span-2">
                                  <PackageTypeField
                                    idPrefix={`line-${line.key}`}
                                    packagingLabel={line.packaging_label || line.uom_label || "package"}
                                    value={line.package_type}
                                    onChange={(v) =>
                                      updateLine(line.key, { package_type: v })
                                    }
                                  />
                                </div>
                              </div>
                              {mode === RETURN_MODES.LPO && line.stock_location ? (
                                <p className="mt-2 text-[11px] text-slate-500">
                                  Deduct from {formatStockLocationLabel(line.stock_location)} when
                                  approved
                                </p>
                              ) : null}
                              {reasonScope === REASON_SCOPE.PER_PRODUCT ? (
                                <p className="mt-3 text-[11px] text-slate-600">
                                  <span className="font-medium text-slate-500">Reason: </span>
                                  {(line.reason ?? "").trim() || "—"}
                                </p>
                              ) : returnReason.trim().length >= 3 ? (
                                <p className="mt-2 text-[11px] text-slate-500">
                                  Reason: {returnReason.trim()}
                                </p>
                              ) : (
                                <p className="mt-2 text-[11px] font-medium text-amber-700">
                                  Return reason required — fill in above before submitting
                                </p>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

/** @deprecated Use RecordSupplierReturnForm */
export { RecordSupplierReturnForm as RecordManualSupplierReturnForm };
