"use client";

import { useState } from "react";
import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import {
  DEFAULT_ORDER_WORKFLOW,
  ORDER_STATUS_OPTIONS,
  normalizeChannelStatusMap,
  sanitizeWorkflowReferences,
  workflowPipelineSteps,
} from "@/lib/order-workflow";
import { STOCK_DEDUCT_TIMING_OPTIONS, normalizeStockDeductOn } from "@/lib/sales-settings";
import { useConfirm } from "@/lib/use-confirm";

const CHANNELS = [
  { id: "pos", label: "POS" },
  { id: "mobile", label: "Mobile" },
  { id: "backend", label: "Backoffice" },
];

function stockChannels(hasPosSales) {
  return hasPosSales ? CHANNELS : CHANNELS.filter((ch) => ch.id !== "pos");
}

function channelLabel(channels, id) {
  return channels.find((ch) => ch.id === id)?.label ?? id;
}

const PIPELINE_STATUS_OPTIONS = ORDER_STATUS_OPTIONS.filter(
  (o) => !["draft", "held", "cancelled"].includes(o.value),
);

/** Save/checkout config dropdowns — pipeline statuses only (not draft/held/cancelled). */
const CONFIGURABLE_STATUS_OPTIONS = ORDER_STATUS_OPTIONS.filter(
  (o) => !["draft", "held", "cancelled"].includes(o.value),
);

function statusLabel(status) {
  return ORDER_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

function stepLabel(wf, status) {
  return wf.steps.find((s) => s.status === status)?.label ?? statusLabel(status);
}

function moveStep(steps, index, direction) {
  const next = [...steps];
  const target = index + direction;
  if (target < 0 || target >= next.length) return steps;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function insertStep(steps, status, afterIndex = steps.length - 1) {
  if (steps.some((s) => s.status === status)) return steps;
  const next = [...steps];
  const insertAt = afterIndex < 0 ? 0 : Math.min(afterIndex + 1, next.length);
  next.splice(insertAt, 0, {
    status,
    label: statusLabel(status),
    enabled: true,
  });
  return next;
}

export function orderWorkflowFromApi(sales) {
  const raw = sales?.order_workflow;
  if (!raw?.steps?.length) {
    return structuredClone(DEFAULT_ORDER_WORKFLOW);
  }
  return sanitizeWorkflowReferences({
    ...structuredClone(DEFAULT_ORDER_WORKFLOW),
    ...raw,
    steps: raw.steps.map((s) => ({
      status: s.status,
      label: s.label ?? statusLabel(s.status),
      enabled: s.enabled !== false,
    })),
    save_status: { ...DEFAULT_ORDER_WORKFLOW.save_status, ...(raw.save_status ?? {}) },
    checkout: {
      ...DEFAULT_ORDER_WORKFLOW.checkout,
      ...(raw.checkout ?? {}),
      full_paid: {
        ...DEFAULT_ORDER_WORKFLOW.checkout.full_paid,
        ...(raw.checkout?.full_paid ?? {}),
      },
      unpaid: {
        ...DEFAULT_ORDER_WORKFLOW.checkout.unpaid,
        ...(raw.checkout?.unpaid ?? {}),
      },
    },
    reserve_stock_on: normalizeChannelStatusMap(
      raw.reserve_stock_on,
      DEFAULT_ORDER_WORKFLOW.reserve_stock_on,
    ),
    deduct_stock_on: normalizeChannelStatusMap(
      raw.deduct_stock_on,
      DEFAULT_ORDER_WORKFLOW.deduct_stock_on,
    ),
    transitions: { ...DEFAULT_ORDER_WORKFLOW.transitions, ...(raw.transitions ?? {}) },
  });
}

export function OrderWorkflowSettingsEditor({
  workflow,
  onChange,
  showCheckoutOnCreate = true,
  showPosCheckoutOnCreate = null,
  stockDeductOn,
  onStockDeductOnChange,
  distributionOpsEnabled = false,
  hasPosSales = false,
  embedded = false,
}) {
  const confirm = useConfirm();
  const wf = workflow ?? DEFAULT_ORDER_WORKFLOW;
  const posCheckout =
    showPosCheckoutOnCreate == null ? showCheckoutOnCreate : Boolean(showPosCheckoutOnCreate);
  const saveOrderMode = !showCheckoutOnCreate || (hasPosSales && !posCheckout);
  const posCheckoutMode = hasPosSales && posCheckout;
  const channels = stockChannels(hasPosSales);
  const stockTiming = normalizeStockDeductOn(stockDeductOn, {
    hasPosSales,
    showCheckoutOnCreate: posCheckout,
  });
  const reserveStockOn = normalizeChannelStatusMap(
    wf.reserve_stock_on,
    DEFAULT_ORDER_WORKFLOW.reserve_stock_on,
  );
  const deductStockOn = normalizeChannelStatusMap(
    wf.deduct_stock_on,
    DEFAULT_ORDER_WORKFLOW.deduct_stock_on,
  );
  const [stepToAdd, setStepToAdd] = useState("");
  const availableToAdd = PIPELINE_STATUS_OPTIONS.filter(
    (o) => !wf.steps.some((s) => s.status === o.value),
  );

  function patch(partial) {
    onChange?.(sanitizeWorkflowReferences({ ...wf, ...partial }));
  }

  function patchStockTiming(channel, value) {
    onStockDeductOnChange?.({
      ...stockTiming,
      [channel]: value,
    });
  }

  function patchChannelStockStatus(key, channel, value) {
    const current = normalizeChannelStatusMap(wf[key], DEFAULT_ORDER_WORKFLOW[key]);
    patch({
      [key]: {
        ...current,
        [channel]: value,
      },
    });
  }

  function timingOptionsForChannel(channel) {
    if (channel === "pos" && posCheckoutMode) {
      return STOCK_DEDUCT_TIMING_OPTIONS.filter((opt) => opt.value === "order_created");
    }
    return STOCK_DEDUCT_TIMING_OPTIONS.filter(
      (opt) =>
        opt.value === "order_created" ||
        opt.value === "order_completed" ||
        (distributionOpsEnabled &&
          (opt.value === "trip_pick" || opt.value === "trip_load" || opt.value === "trip_depart")),
    );
  }

  function patchStep(index, partial) {
    const steps = wf.steps.map((s, i) => (i === index ? { ...s, ...partial } : s));
    patch({ steps });
  }

  async function removeStep(index) {
    const step = wf.steps[index];
    if (!step) return;
    if (wf.steps.length <= 1) return;
    const label = step.label || statusLabel(step.status);
    const ok = await confirm({
      title: "Delete workflow stage",
      message: `Delete stage "${label}" from this client's workflow? POS will no longer use it.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    patch({ steps: wf.steps.filter((_, i) => i !== index) });
  }

  function addStep() {
    if (!stepToAdd) return;
    patch({ steps: insertStep(wf.steps, stepToAdd) });
    setStepToAdd("");
  }

  const pipelinePreview = workflowPipelineSteps({
    pipeline: wf.steps
      .filter((s) => s.enabled !== false)
      .map((s) => ({ key: s.status, label: s.label })),
  });

  const intro = (
    <>
      {!embedded ? <h3 className="theme-heading text-sm font-semibold">Order workflow</h3> : null}
      <p className={embedded ? "theme-subtext text-sm" : "theme-subtext mt-1 text-xs"}>
        Define the order pipeline for this client. Stages can be inserted, edited, reordered, or
        deleted. Status moves follow this pipeline — one step up or down only. Enabled stages
        appear as sidebar order pages in this order (View All, then each stage).
        {saveOrderMode
          ? hasPosSales && !posCheckout && showCheckoutOnCreate
            ? " External POS uses Save order — configure the initial save status below. Backoffice Create order still opens checkout."
            : !showCheckoutOnCreate && hasPosSales && posCheckout
              ? " Backoffice Create order uses Save order — configure the initial save status below. External POS still opens checkout."
              : " Save order mode is on for one or more surfaces — configure the initial save status below. Payment rules apply to all orders."
          : " Checkout on create is enabled for configured surfaces. Payment rules below apply to all orders."}
      </p>
      {pipelinePreview.length > 0 ? (
        <p className={`theme-accent-label ${embedded ? "mt-2" : "mt-2"} text-xs`}>
          Pipeline: {pipelinePreview.map((s) => s.label).join(" → ")}
        </p>
      ) : null}
    </>
  );

  const body = (
    <>
      <div>{intro}</div>

      <div className="space-y-2">
        <p className="theme-accent-label text-xs font-semibold uppercase tracking-wide">Pipeline stages</p>
        {wf.steps.map((step, index) => (
          <div
            key={`${step.status}-${index}`}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2"
          >
            <input
              type="checkbox"
              checked={step.enabled !== false}
              onChange={(e) => patchStep(index, { enabled: e.target.checked })}
              title="Include this stage in the active pipeline"
            />
            <span
              className="theme-text-muted w-28 shrink-0 text-xs font-medium uppercase"
              title="System key"
            >
              {step.status}
            </span>
            <Field label="Display name" className="min-w-[10rem] flex-1">
              <input
                type="text"
                className={inputClassName()}
                value={step.label}
                onChange={(e) => patchStep(index, { label: e.target.value })}
                placeholder={statusLabel(step.status)}
              />
            </Field>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => patch({ steps: moveStep(wf.steps, index, -1) })}
                className="theme-secondary-btn rounded px-2 py-1 text-xs disabled:opacity-40"
                title="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={index === wf.steps.length - 1}
                onClick={() => patch({ steps: moveStep(wf.steps, index, 1) })}
                className="theme-secondary-btn rounded px-2 py-1 text-xs disabled:opacity-40"
                title="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                disabled={wf.steps.length <= 1}
                onClick={() => void removeStep(index)}
                className="rounded border border-[color-mix(in_srgb,#ef4444_35%,var(--theme-border))] bg-[color-mix(in_srgb,#ef4444_8%,var(--theme-surface))] px-2 py-1 text-xs text-[color-mix(in_srgb,#ef4444_75%,var(--theme-text))] hover:bg-[color-mix(in_srgb,#ef4444_14%,var(--theme-surface))] disabled:opacity-40"
                title="Delete stage from pipeline"
              >
                Delete
              </button>
            </div>
          </div>
        ))}

        {availableToAdd.length > 0 ? (
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-[var(--theme-border)] bg-[var(--theme-surface-muted)] p-3">
            <Field label="Insert stage" className="min-w-[10rem] flex-1">
              <select
                className={inputClassName()}
                value={stepToAdd}
                onChange={(e) => setStepToAdd(e.target.value)}
              >
                <option value="">— Choose stage —</option>
                {availableToAdd.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <button
              type="button"
              disabled={!stepToAdd}
              onClick={addStep}
              className="theme-primary-btn rounded-lg px-3 py-2 text-xs font-bold uppercase disabled:opacity-40"
            >
              Insert
            </button>
          </div>
        ) : null}
      </div>

      {saveOrderMode ? (
        <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] p-3">
          <p className="theme-accent-label text-xs font-semibold uppercase tracking-wide">
            Save order (no checkout)
          </p>
          <p className="theme-subtext mt-1 text-xs">
            One or more surfaces use <strong className="theme-heading font-semibold">Save order</strong>{" "}
            instead of checkout. New orders are created at the status below for each channel.
            Stock reservation and deduction follow the settings further down.
          </p>
          <div className={`mt-3 grid gap-3 ${channels.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {channels.map((ch) => (
              <Field key={ch.id} label={ch.label}>
                <select
                  className={inputClassName()}
                  value={wf.save_status?.[ch.id] ?? "unpaid"}
                  onChange={(e) =>
                    patch({
                      save_status: { ...wf.save_status, [ch.id]: e.target.value },
                    })
                  }
                >
                  {CONFIGURABLE_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {stepLabel(wf, o.value)}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
        </div>
      ) : (
        <p className="theme-subtext rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2 text-xs">
          Save order settings apply when <strong className="theme-heading font-semibold">Show checkout on create order</strong> is turned off
          in Payment fields above. With checkout enabled, cashiers complete orders through the
          payment screen instead.
        </p>
      )}

      <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-3">
        <p className="theme-accent-label text-xs font-semibold uppercase tracking-wide">
          Order status by payment
        </p>
        <p className="theme-subtext mt-1 text-xs">
          These rules apply to <strong className="theme-heading font-semibold">all orders</strong> — saved directly or completed through
          checkout — whenever payment (or lack of it) determines the order status.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Status when partially paid">
            <select
              className={inputClassName()}
              value={wf.checkout?.partial ?? "pending_payment"}
              onChange={(e) => patch({ checkout: { ...wf.checkout, partial: e.target.value } })}
            >
              {CONFIGURABLE_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {stepLabel(wf, o.value)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-4 space-y-2">
          <p className="theme-accent-label text-xs font-semibold uppercase tracking-wide">
            Status when fully paid
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {CHANNELS.map((ch) => (
              <Field key={ch.id} label={ch.label}>
                <select
                  className={inputClassName()}
                  value={wf.checkout?.full_paid?.[ch.id] ?? "paid"}
                  onChange={(e) =>
                    patch({
                      checkout: {
                        ...wf.checkout,
                        full_paid: { ...wf.checkout?.full_paid, [ch.id]: e.target.value },
                      },
                    })
                  }
                >
                  {CONFIGURABLE_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {stepLabel(wf, o.value)}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <p className="theme-accent-label text-xs font-semibold uppercase tracking-wide">
            Status when unpaid
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {CHANNELS.map((ch) => (
              <Field key={ch.id} label={ch.label}>
                <select
                  className={inputClassName()}
                  value={wf.checkout?.unpaid?.[ch.id] ?? "unpaid"}
                  onChange={(e) =>
                    patch({
                      checkout: {
                        ...wf.checkout,
                        unpaid: { ...wf.checkout?.unpaid, [ch.id]: e.target.value },
                      },
                    })
                  }
                >
                  {CONFIGURABLE_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {stepLabel(wf, o.value)}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-3">
        <p className="theme-accent-label text-xs font-semibold uppercase tracking-wide">Stock reservation</p>
        <p className="theme-subtext mt-1 text-xs">
          When an order reaches this status, quantity is held in reservation so live available stock
          drops and overselling is avoided. Cancelled orders release reservations back to live stock.
          Cart reservations still apply while building an order before checkout.
          {posCheckoutMode ? (
            <>
              {" "}
              External POS with checkout deducts stock immediately on placement — reservation does not
              apply to POS.
            </>
          ) : null}
        </p>
        <div className={`mt-3 grid gap-3 ${channels.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          {channels.map((ch) => (
            <Field key={ch.id} label={channelLabel(channels, ch.id)}>
              <select
                className={inputClassName()}
                value={reserveStockOn[ch.id] ?? "unpaid"}
                disabled={ch.id === "pos" && posCheckoutMode}
                onChange={(e) => patchChannelStockStatus("reserve_stock_on", ch.id, e.target.value)}
              >
                {CONFIGURABLE_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {stepLabel(wf, o.value)}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-3">
        <p className="theme-accent-label text-xs font-semibold uppercase tracking-wide">Stock deduction</p>
        <p className="theme-subtext mt-1 text-xs">
          Controls when inventory is fully deducted and reservations are cleared. Settings are per
          channel — POS, mobile field sales, and backoffice can use different timings. Trip options
          apply when distribution operations are enabled.
        </p>
        <div className="mt-3 space-y-4">
          {channels.map((ch) => {
            const timing = stockTiming[ch.id] ?? "order_completed";
            const timingOptions = timingOptionsForChannel(ch.id);
            const posLocked = ch.id === "pos" && posCheckoutMode;

            return (
              <div
                key={ch.id}
                className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] p-3"
              >
                <p className="theme-accent-label text-xs font-semibold uppercase tracking-wide">
                  {channelLabel(channels, ch.id)}
                </p>
                <div className="mt-3 space-y-3">
                  <Field label="Deduct stock when">
                    <select
                      className={inputClassName()}
                      value={posLocked ? "order_created" : timing}
                      disabled={posLocked}
                      onChange={(e) => patchStockTiming(ch.id, e.target.value)}
                    >
                      {timingOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {posLocked ? (
                    <p className="theme-subtext text-xs">
                      External POS with checkout always deducts stock when the order is placed.
                    </p>
                  ) : timing === "order_created" ? (
                    <p className="theme-subtext text-xs">
                      Stock is reduced when the order is placed. Cancellations and order edits restore
                      stock when processed.
                    </p>
                  ) : timing === "order_completed" ? (
                    <Field label="Deduct at order status">
                      <select
                        className={inputClassName()}
                        value={deductStockOn[ch.id] ?? "completed"}
                        onChange={(e) => patchChannelStockStatus("deduct_stock_on", ch.id, e.target.value)}
                      >
                        {CONFIGURABLE_STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {stepLabel(wf, o.value)}
                          </option>
                        ))}
                      </select>
                      <p className="theme-subtext mt-1 text-xs">
                        Inventory is reduced when the order reaches this status (at checkout if already
                        there, otherwise on workflow transition).
                      </p>
                    </Field>
                  ) : timing === "trip_pick" ? (
                    <p className="theme-subtext text-xs">
                      Stock is deducted when the warehouse marks the trip picking list complete.
                    </p>
                  ) : timing === "trip_load" ? (
                    <p className="theme-subtext text-xs">
                      Stock stays reserved until the loading list is locked for the trip.
                    </p>
                  ) : timing === "trip_depart" ? (
                    <p className="theme-subtext text-xs">
                      Stock stays reserved until the trip departs.
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );

  if (embedded) {
    return <div className="space-y-4">{body}</div>;
  }

  return (
    <div className="theme-panel space-y-4 rounded-xl border p-4">{body}</div>
  );
}
