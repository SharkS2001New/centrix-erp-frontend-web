"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, apiRequestMultipart, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Field, inputClassName, formatShortDate, RequiredMark } from "@/components/catalog/catalog-shared";
import { ReturnProofField } from "@/components/returns/return-proof-field";
import { LpoProductSearchPanel } from "@/components/lpo/lpo-product-search-panel";
import { formatPackagingLabel, packageNameFromUom } from "@/components/lpo/lpo-product-utils";
import {
  formatPoNumber,
  lpoDisplayNumber,
  lpoRowDisplayNumber,
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
import { parseReturnReason, resolveReturnReason } from "@/components/sales/customer-returns-shared";
import { ReturnReasonFields, isReturnReasonValid } from "@/components/returns/return-reason-fields";

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
  const [returnReasonPreset, setReturnReasonPreset] = useState("Damaged Product");
  const [returnReasonOther, setReturnReasonOther] = useState("");
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
  const resolvedOrderReason = useMemo(
    () => resolveReturnReason(returnReasonPreset, returnReasonOther),
    [returnReasonPreset, returnReasonOther],
  );
  const [proofFile, setProofFile] = useState(null);
  const [existingProof, setExistingProof] = useState(null);
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
        const parsedReason = parseReturnReason(doc.return_reason ?? doc.notes ?? "");
        setReturnReasonPreset(parsedReason.preset);
        setReturnReasonOther(parsedReason.other);
        setNotes(doc.notes ?? "");
        setExistingProof(doc.proof ?? null);
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
    loadLpoOptions(supplierId);
  }, [supplierId, loadLpoOptions]);

  useEffect(() => {
    if (!lpoNo) {
      setLpoSummary(null);
      return;
    }
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
    if (!lpoNo || loadingLpoSummary) return;

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
    if (initialLpoNo && next === RETURN_MODES.MANUAL) return;
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
    if (next === RETURN_MODES.MANUAL && !initialLpoNo) {
      setLpoNo("");
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
    setAddDraft({ ...DEFAULT_RETURN_DRAFT });
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
    const orderReason = resolveReturnReason(returnReasonPreset, returnReasonOther);
    const lineReason =
      reasonScope === REASON_SCOPE.PER_PRODUCT
        ? resolveReturnReason(addDraft.reasonPreset, addDraft.reasonOther)
        : orderReason;
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
    if (reasonScope === REASON_SCOPE.ORDER && orderReason.length < 3) {
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

    setAddDraft({ ...DEFAULT_RETURN_DRAFT });
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
    if (reasonScope === REASON_SCOPE.ORDER && !isReturnReasonValid(returnReasonPreset, returnReasonOther)) {
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
      return isReturnReasonValid(returnReasonPreset, returnReasonOther);
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
    returnReasonPreset,
    returnReasonOther,
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
        ? resolvedOrderReason
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
      const linkedLpoNo = lpoNo && Number(lpoNo) > 0 ? Number(lpoNo) : null;
      const payload = {
        supplier_id: Number(supplierId),
        branch_id: Number(branchId),
        source_type: linkedLpoNo ? RETURN_MODES.LPO : RETURN_MODES.MANUAL,
        lpo_no: linkedLpoNo,
        supplier_invoice_no: supplierInvoiceNo.trim() || null,
        reason_scope: reasonScope,
        return_reason: docNotes,
        notes: docNotes,
        lines: apiLines,
      };

      if (editDocumentId) {
        if (proofFile) {
          await apiRequestMultipart(
            `/supplier-return-documents/${editDocumentId}`,
            { ...payload, proof: proofFile },
            { method: "PUT" },
          );
        } else {
          await apiRequest(`/supplier-return-documents/${editDocumentId}`, {
            method: "PUT",
            body: payload,
          });
        }
      } else if (proofFile) {
        await apiRequestMultipart("/supplier-return-documents", { ...payload, proof: proofFile });
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


  function renderPendingAddBar({ title, subtitle }) {
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
      <div className="relative z-20 rounded-lg border border-[var(--theme-primary)]/30 bg-[var(--theme-primary-subtle)] p-4 shadow-sm">
        <p className="theme-heading text-sm font-medium">{title}</p>
        {subtitle ? <p className="theme-subtext mt-0.5 text-xs">{subtitle}</p> : null}
        <p className="theme-subtext mt-1 text-[11px]">
          Stock unit: <span className="font-medium text-[var(--theme-text)]">{pendingPackagingLabel}</span>
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
              <p className="theme-input-readonly rounded-lg border px-3 py-2 text-sm">
                {formatStockLocationLabel(addDraft.stock_location)}
                <span className="theme-subtext mt-0.5 block text-xs font-normal">
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
              <ReturnReasonFields
                preset={addDraft.reasonPreset}
                otherText={addDraft.reasonOther}
                onPresetChange={(value) => setAddDraft((d) => ({ ...d, reasonPreset: value }))}
                onOtherTextChange={(value) => setAddDraft((d) => ({ ...d, reasonOther: value }))}
                label="Reason for this product"
              />
            </div>
          ) : null}
        </div>
        {loadingStock ? (
          <p className="theme-subtext mt-2 text-xs">Loading branch stock…</p>
        ) : null}
        {stockHint ? (
          <p className="theme-subtext mt-2 text-xs">
            Branch stock — shop: {stockHint.shop}, store: {stockHint.store}
            {mode === RETURN_MODES.MANUAL && addDraft.stock_location === STOCK_LOCATION.SHOP ? (
              <> · returning from shop</>
            ) : mode === RETURN_MODES.MANUAL && addDraft.stock_location === STOCK_LOCATION.STORE ? (
              <> · returning from store</>
            ) : null}
          </p>
        ) : null}
        {mode === RETURN_MODES.LPO && pendingLpoLine && lpoLocMeta && (lpoLocMeta.shop > 0 || lpoLocMeta.store > 0) ? (
          <p className="theme-subtext mt-2 text-xs">
            Received on this LPO — shop: {lpoLocMeta.shop}, store: {lpoLocMeta.store} (base units)
          </p>
        ) : null}
        {mode === RETURN_MODES.LPO && pendingLpoStockPreview != null ? (
          <p className="theme-subtext mt-2 text-xs">
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
            className="theme-primary-btn rounded-lg px-4 py-2 text-sm font-medium shadow-sm"
          >
            Add to return
          </button>
          <button
            type="button"
            onClick={() => {
              setPendingManual(null);
              setPendingLpoLine(null);
              setAddDraft({ ...DEFAULT_RETURN_DRAFT });
            }}
            className="theme-secondary-btn rounded-lg px-4 py-2 text-sm shadow-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="theme-workspace -m-6 flex min-h-[calc(100%+3rem)] w-full flex-col p-6 md:-m-8 md:min-h-[calc(100%+4rem)] md:p-8">
      <div className="mb-4 shrink-0">
        <Link href={backHref} className="theme-link text-sm hover:underline">
          {backLabel}
        </Link>
        <h1 className="theme-heading mt-2 text-xl font-medium">{pageTitle}</h1>
        <p className="theme-subtext mt-1 max-w-3xl text-sm">{pageSubtitle}</p>
      </div>

      {loadingMeta || loadingDocument ? (
        <p className="theme-subtext text-sm">Loading…</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col theme-panel rounded-xl border shadow-sm">
          {!editDocumentId && !initialLpoNo ? (
          <div className="flex shrink-0 flex-wrap gap-1 border-b border-[var(--theme-border)] px-4 pt-3">
            {RETURN_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => switchMode(t.id)}
                className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
                  mode === t.id
                    ? "theme-tab-active border border-b-[var(--theme-page-bg)] border-[var(--theme-border)] shadow-sm"
                    : "theme-tab-inactive"
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
            <p className="shrink-0 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-3 py-2 text-xs text-[var(--theme-text-muted)]">
              Every return is tied to one supplier. Choose Shop or Store — stock is deducted from
              that location only. LPO returns use the location where stock was received on the PO.
            </p>

            <div className="grid shrink-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Supplier" required>
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
                        {lpoRowDisplayNumber(l)} — {l.status_name ?? `Status ${l.lpo_status_code}`}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}

              {mode === RETURN_MODES.MANUAL && supplierId ? (
                <Field label="Purchase order (optional)">
                  <select
                    className={inputClassName()}
                    value={lpoNo}
                    onChange={(e) => {
                      setLpoNo(e.target.value);
                      if (!e.target.value) {
                        setLpoSummary(null);
                        setSupplierInvoiceNo("");
                      }
                    }}
                    disabled={loadingLpos}
                  >
                    <option value="">
                      {loadingLpos ? "Loading LPOs…" : "None — manual / legacy stock"}
                    </option>
                    {lpoOptions.map((l) => (
                      <option key={l.lpo_no} value={String(l.lpo_no)}>
                        {lpoRowDisplayNumber(l)} — {l.status_name ?? `Status ${l.lpo_status_code}`}
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
                    <Field label="Supplier inv. no." required>
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
                      <p className="theme-subtext mt-1 text-[11px]">
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
                        className={`${inputClassName()} theme-input-readonly cursor-not-allowed`}
                        value={supplierInvoiceNo}
                      />
                      <p className="theme-subtext mt-1 text-[11px]">
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
                      <p className="theme-subtext mt-1 text-[11px]">
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
                      <p className="theme-subtext mt-1 text-[11px]">
                        Receive stock on this LPO first — saved supplier invoices will appear here.
                      </p>
                    ) : null}
                  </Field>
                )}
              </div>
            </div>

            {mode === RETURN_MODES.LPO && lpoNo && loadingLpoSummary ? (
              <p className="theme-subtext mt-4 text-sm">Loading LPO lines…</p>
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

            <div className="mt-4 grid min-h-0 flex-1 gap-6 border-t border-[var(--theme-border)] pt-4 lg:grid-cols-12">
              <div className="relative flex min-h-0 flex-col gap-4 overflow-visible lg:col-span-5 lg:border-r lg:border-[var(--theme-border)] lg:pr-6">
                <div className="relative z-0">
                  <p className="theme-heading mb-2 text-sm font-semibold">
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
                    <div className="theme-table-shell overflow-hidden rounded-lg border">
                      <div className="max-h-[min(50vh,440px)] overflow-auto">
                        <table className="theme-table w-full border-collapse text-xs">
                          <thead className="sticky top-0 z-10 bg-[var(--theme-surface-muted)]">
                            <tr className="theme-table-head-row text-left font-semibold">
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
                                className={`theme-table-body-row border-b border-[var(--theme-border)] ${alreadyAdded ? "bg-[var(--theme-surface-muted)]/80" : "hover:bg-[var(--theme-hover)]"}`}
                              >
                                <td className="px-2 py-2">
                                  <span className="theme-heading font-medium">
                                    {line.product_name}
                                  </span>
                                  <span className="theme-subtext block font-mono text-[10px]">
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
                                    <span className="text-[11px] font-medium text-[var(--theme-text-subtle)]">Added</span>
                                  ) : (
                                  <button
                                    type="button"
                                    onClick={() => selectLpoLine(line)}
                                    className="theme-link hover:underline"
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
                    <p className="theme-subtext text-sm">
                      Select a supplier and LPO to add return lines.
                    </p>
                  ) : null}
                </div>

                {pendingManual ? (
                  renderPendingAddBar({
                    title: pendingManual.product_name,
                    subtitle: `${pendingManual.product_code} · ${formatPackagingLabel(pendingManual.uom)}`,
                  })
                ) : null}

                {pendingLpoLine ? (
                  renderPendingAddBar({
                    title: pendingLpoLine.product_name,
                    subtitle: `Received ${pendingLpoLine.received_qty} of ${pendingLpoLine.ordered_qty} · max return ${pendingLpoLine.max_return_qty}`,
                  })
                ) : null}

                {addError && !pendingManual && !pendingLpoLine ? (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{addError}</p>
                ) : null}

                <div className="space-y-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] p-3">
                  <p className="theme-heading text-sm font-semibold">
                    Return reason
                    <RequiredMark />
                  </p>
                  {reasonScopeLocked ? (
                    <p className="theme-subtext text-xs">
                      {reasonScope === REASON_SCOPE.ORDER
                        ? "Same reason for whole order — locked after adding the first product. Remove all items to change."
                        : "Per product — locked after adding the first product. Remove all items to change."}
                    </p>
                  ) : null}
                  <div className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:gap-4">
                    <label
                      className={`flex items-center gap-2 ${reasonScopeLocked ? "cursor-not-allowed text-[var(--theme-text-subtle)]" : "cursor-pointer"}`}
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
                      className={`flex items-center gap-2 ${reasonScopeLocked ? "cursor-not-allowed text-[var(--theme-text-subtle)]" : "cursor-pointer"}`}
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
                    <div className={reasonScopeLocked ? "pointer-events-none opacity-60" : ""}>
                      <ReturnReasonFields
                        preset={returnReasonPreset}
                        otherText={returnReasonOther}
                        onPresetChange={(value) => {
                          if (reasonScopeLocked) return;
                          setReturnReasonPreset(value);
                          if (returnReasonError) setReturnReasonError(null);
                        }}
                        onOtherTextChange={(value) => {
                          if (reasonScopeLocked) return;
                          setReturnReasonOther(value);
                          if (returnReasonError) setReturnReasonError(null);
                        }}
                        label="Reason to return"
                        disabled={reasonScopeLocked}
                        selectClassName={`${inputClassName()} ${returnReasonError ? "border-red-300 focus:border-red-400 focus:ring-red-200" : ""}`}
                        otherClassName={`${inputClassName()} ${returnReasonError ? "border-red-300 focus:border-red-400 focus:ring-red-200" : ""}`}
                      />
                      {returnReasonError ? (
                        <p className="mt-1 text-xs text-red-600">{returnReasonError}</p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="theme-subtext text-xs">
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
                  <ReturnProofField
                    file={proofFile}
                    onChange={setProofFile}
                    existingProof={existingProof}
                    disabled={saving || reasonScopeLocked}
                  />
                </div>

                <div className="mt-auto space-y-3 border-t border-[var(--theme-border)] pt-4">
                  <p className="theme-subtext text-xs">
                    Submitted returns stay pending until a senior user approves them. Stock is only
                    adjusted after approval.
                  </p>

                  {formError ? (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={backHref}
                      className="theme-secondary-btn rounded-lg px-4 py-2 text-sm shadow-sm"
                    >
                      Cancel
                    </Link>
                    <button
                      type="submit"
                      disabled={saving || !canSubmit}
                      title={
                        !canSubmit
                          ? reasonScope === REASON_SCOPE.ORDER &&
                              !isReturnReasonValid(returnReasonPreset, returnReasonOther)
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
                <p className="theme-heading mb-2 text-sm font-semibold">
                  Items on this return ({lines.length})
                </p>

                {lines.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-8 text-center text-sm text-[var(--theme-text-muted)]">
                    No items yet. Choose a product on the left, set qty to return and location,
                    then click &quot;Add to return&quot;.
                    {reasonScope === REASON_SCOPE.PER_PRODUCT
                      ? " Add a reason per product when using different reasons."
                      : null}
                  </p>
                ) : (
                  <div className="theme-table-shell min-h-0 flex-1 overflow-hidden rounded-lg border">
                    <div className="max-h-[min(58vh,520px)] overflow-auto">
                      <ul className="divide-y divide-[var(--theme-border)]">
                        {lines.map((line) => {
                          const stockPreview =
                            mode === RETURN_MODES.LPO && line.received_qty != null
                              ? lpoStockDeductQty(line, line.quantity)
                              : null;
                          return (
                            <li key={line.key} className="p-4">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="theme-heading font-medium">{line.product_name}</p>
                                  <p className="theme-subtext font-mono text-xs">{line.product_code}</p>
                                  {stockPreview != null ? (
                                    <p className="theme-subtext mt-0.5 text-[11px]">
                                      {stockPreview > 0
                                        ? `${stockPreview} pack(s) from stock when approved`
                                        : "No stock deduction when approved"}
                                    </p>
                                  ) : null}
                                  {line.max_return_qty != null ? (
                                    <p className="theme-subtext text-[11px]">
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
                                        <p className="theme-input-readonly rounded-lg border px-3 py-2 text-sm">
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
                                <p className="theme-subtext mt-2 text-[11px]">
                                  Deduct from {formatStockLocationLabel(line.stock_location)} when
                                  approved
                                </p>
                              ) : null}
                              {reasonScope === REASON_SCOPE.PER_PRODUCT ? (
                                <p className="theme-text-muted mt-3 text-[11px]">
                                  <span className="theme-subtext font-medium">Reason: </span>
                                  {(line.reason ?? "").trim() || "—"}
                                </p>
                              ) : resolvedOrderReason.length >= 3 ? (
                                <p className="theme-subtext mt-2 text-[11px]">
                                  Reason: {resolvedOrderReason}
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
