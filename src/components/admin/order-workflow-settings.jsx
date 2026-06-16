"use client";

import { useState } from "react";
import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import {
  DEFAULT_ORDER_WORKFLOW,
  ORDER_STATUS_OPTIONS,
  sanitizeWorkflowReferences,
  workflowPipelineSteps,
} from "@/lib/order-workflow";
import { STOCK_DEDUCT_TIMING_OPTIONS } from "@/lib/sales-settings";

const CHANNELS = [
  { id: "pos", label: "POS" },
  { id: "mobile", label: "Mobile" },
  { id: "backend", label: "Backend" },
];

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
    transitions: { ...DEFAULT_ORDER_WORKFLOW.transitions, ...(raw.transitions ?? {}) },
  });
}

export function OrderWorkflowSettingsEditor({
  workflow,
  onChange,
  showCheckoutOnCreate = true,
  stockDeductOn = "order_completed",
  onStockDeductOnChange,
  distributionOpsEnabled = false,
}) {
  const wf = workflow ?? DEFAULT_ORDER_WORKFLOW;
  const saveOrderMode = !showCheckoutOnCreate;
  const [stepToAdd, setStepToAdd] = useState("");
  const availableToAdd = PIPELINE_STATUS_OPTIONS.filter(
    (o) => !wf.steps.some((s) => s.status === o.value),
  );

  function patch(partial) {
    onChange?.(sanitizeWorkflowReferences({ ...wf, ...partial }));
  }

  function patchStep(index, partial) {
    const steps = wf.steps.map((s, i) => (i === index ? { ...s, ...partial } : s));
    patch({ steps });
  }

  function removeStep(index) {
    const step = wf.steps[index];
    if (!step) return;
    if (wf.steps.length <= 1) return;
    const label = step.label || statusLabel(step.status);
    if (!window.confirm(`Delete stage "${label}" from this client's workflow? POS will no longer use it.`)) {
      return;
    }
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

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Order workflow</h3>
        <p className="mt-1 text-xs text-slate-500">
          Define the order pipeline for this client. Stages can be inserted, edited, reordered, or
          deleted. Status moves follow this pipeline — one step up or down only. Enabled stages
          appear as sidebar order pages in this order (View All, then each stage).
          {saveOrderMode
            ? " POS uses Save order (no checkout) — configure the initial save status below. Payment rules apply to all orders."
            : " POS opens checkout on create order. Payment rules below apply to all orders."}
        </p>
        {pipelinePreview.length > 0 ? (
          <p className="mt-2 text-xs text-[#0C447C]">
            Pipeline: {pipelinePreview.map((s) => s.label).join(" → ")}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pipeline stages</p>
        {wf.steps.map((step, index) => (
          <div
            key={`${step.status}-${index}`}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
          >
            <input
              type="checkbox"
              checked={step.enabled !== false}
              onChange={(e) => patchStep(index, { enabled: e.target.checked })}
              title="Include this stage in the active pipeline"
            />
            <span className="w-28 shrink-0 text-xs font-medium uppercase text-slate-500" title="System key">
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
                className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                title="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={index === wf.steps.length - 1}
                onClick={() => patch({ steps: moveStep(wf.steps, index, 1) })}
                className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                title="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                disabled={wf.steps.length <= 1}
                onClick={() => removeStep(index)}
                className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-40"
                title="Delete stage from pipeline"
              >
                Delete
              </button>
            </div>
          </div>
        ))}

        {availableToAdd.length > 0 ? (
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-slate-300 bg-white p-3">
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
              className="rounded-lg border border-[#185FA5]/30 bg-[#E6F1FB] px-3 py-2 text-xs font-bold uppercase text-[#0C447C] hover:bg-[#d6e8f8] disabled:opacity-40"
            >
              Insert
            </button>
          </div>
        ) : null}
      </div>

      {saveOrderMode ? (
        <div className="rounded-lg border border-[#185FA5]/20 bg-[#E6F1FB]/50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#0C447C]">
            Save order (no checkout)
          </p>
          <p className="mt-1 text-xs text-slate-600">
            <strong>Show checkout on create order</strong> is off, so the POS shows{" "}
            <strong>Save order</strong> instead of checkout. New orders are created at this status.
            Stock is deducted immediately when the order is saved.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {CHANNELS.map((ch) => (
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
        <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          Save order settings apply when <strong>Show checkout on create order</strong> is turned off
          in Payment fields above. With checkout enabled, cashiers complete orders through the
          payment screen instead.
        </p>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Order status by payment
        </p>
        <p className="mt-1 text-xs text-slate-600">
          These rules apply to <strong>all orders</strong> — saved directly or completed through
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
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
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
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
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

      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stock deduction</p>
        <p className="mt-1 text-xs text-slate-600">
          Controls when inventory is reduced for POS checkout and order workflow transitions. Trip
          options apply when distribution operations are enabled.
        </p>
        <div className="mt-3 space-y-3">
          <Field label="Deduct stock when">
            <select
              className={inputClassName()}
              value={stockDeductOn}
              onChange={(e) => onStockDeductOnChange?.(e.target.value)}
            >
              {STOCK_DEDUCT_TIMING_OPTIONS.filter(
                (opt) =>
                  opt.value === "order_completed" ||
                  (distributionOpsEnabled && opt.value !== "order_completed"),
              ).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
          {stockDeductOn === "order_completed" ? (
            <Field label="Deduct at order status">
              <select
                className={inputClassName()}
                value={wf.deduct_stock_on ?? "completed"}
                onChange={(e) => patch({ deduct_stock_on: e.target.value })}
              >
                {CONFIGURABLE_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {stepLabel(wf, o.value)}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                POS checkout may deduct immediately unless the order is saved without payment.
              </p>
            </Field>
          ) : (
            <p className="text-xs text-slate-500">
              Stock is held until the loading list is locked or the trip departs. Order workflow
              status transitions will not reduce inventory.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
