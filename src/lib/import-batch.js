/** @typedef {{ row?: number, code?: string, message?: string }} ImportFailure */

/** @typedef {{ label: string, percent?: number | null }} ImportProgressState */

/** Must stay within the API inline import row limit (stored in background_tasks, not local disk). */
export const IMPORT_BATCH_SIZE = 200;

/**
 * @param {{
 *   rows?: Record<string, unknown>[],
 *   requiredKeys?: string[],
 *   mapRow?: (row: Record<string, unknown>) => Record<string, unknown> | null,
 * }} opts
 */
export function prepareImportRows({ rows = [], requiredKeys = [], mapRow } = {}) {
  /** @type {Record<string, unknown>[]} */
  const validRows = [];
  /** @type {ImportFailure[]} */
  const failures = [];

  (rows ?? []).forEach((row, index) => {
    const rowNumber = index + 1;
    if (!row || typeof row !== "object") return;

    const hasAny = Object.values(row).some((value) => String(value ?? "").trim() !== "");
    if (!hasAny) return;

    const trimmed = Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]),
    );

    const missing = requiredKeys.filter((key) => !String(trimmed[key] ?? "").trim());
    if (missing.length) {
      failures.push({
        row: rowNumber,
        message: `Missing required field(s): ${missing.join(", ")}`,
      });
      return;
    }

    try {
      const mapped = mapRow ? mapRow(trimmed) : trimmed;
      if (mapped) validRows.push(mapped);
    } catch (err) {
      failures.push({
        row: rowNumber,
        message: err instanceof Error ? err.message : "Invalid row.",
      });
    }
  });

  return { rows: validRows, failures };
}

/**
 * @param {{
 *   batchIndex: number,
 *   batchCount: number,
 *   offset: number,
 *   chunkSize: number,
 *   total: number,
 *   task?: Record<string, unknown> | null,
 * }} info
 * @returns {ImportProgressState}
 */
export function formatImportBatchProgress({ batchIndex, batchCount, offset, chunkSize, total, task }) {
  const processed = Math.min(offset + chunkSize, total);
  const batchLabel = batchCount > 1 ? `Batch ${batchIndex + 1} of ${batchCount} · ` : "";
  const taskPercent = Number(task?.progress ?? NaN);
  const percent = Number.isFinite(taskPercent) ? taskPercent : null;
  const percentLabel = percent != null ? ` · ${percent}%` : "";

  return {
    label: `${batchLabel}Imported ${processed.toLocaleString()} of ${total.toLocaleString()} rows${percentLabel}`,
    percent,
  };
}

/** @param {ImportFailure[]} failures @param {number} rowOffset */
export function offsetImportFailures(failures, rowOffset) {
  return (failures ?? []).map((failure) => ({
    ...failure,
    row: typeof failure.row === "number" ? failure.row + rowOffset : failure.row,
  }));
}

/**
 * @param {ImportFailure[]} failures
 * @param {number} [limit=8]
 */
export function summarizeImportFailures(failures, limit = 8) {
  const list = failures ?? [];
  if (!list.length) return "";

  const lines = list.slice(0, limit).map((failure) => {
    const label = failure.code ?? (failure.row != null ? `Row ${failure.row}` : "Row");
    return `${label}: ${failure.message ?? "Import failed."}`;
  });

  if (list.length > limit) {
    lines.push(`…and ${list.length - limit} more row error(s).`);
  }

  return lines.join("\n");
}

/**
 * @param {{
 *   rows: Record<string, unknown>[],
 *   batchSize?: number,
 *   runQueuedTask: (requestFn: () => Promise<Record<string, unknown>>, opts?: Record<string, unknown>) => Promise<Record<string, unknown>>,
 *   importChunk: (chunk: Record<string, unknown>[]) => Promise<Record<string, unknown>>,
 *   onBatchProgress?: (info: { batchIndex: number, batchCount: number, offset: number, total: number, task?: Record<string, unknown> }) => void,
 * }} opts
 */
export async function runBatchedQueuedImport({
  rows,
  batchSize = IMPORT_BATCH_SIZE,
  runQueuedTask,
  importChunk,
  onBatchProgress,
}) {
  if (!rows.length) {
    throw new Error("The file has no valid rows.");
  }

  let created = 0;
  let skipped = 0;
  /** @type {ImportFailure[]} */
  const failures = [];
  const batchCount = Math.ceil(rows.length / batchSize);

  for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
    const offset = batchIndex * batchSize;
    const chunk = rows.slice(offset, offset + batchSize);
    const res = await runQueuedTask(
      () => importChunk(chunk),
      {
        message: `Importing rows ${offset + 1}-${offset + chunk.length} of ${rows.length}…`,
        onProgress: (task) => {
          onBatchProgress?.({
            batchIndex,
            batchCount,
            offset,
            chunkSize: chunk.length,
            total: rows.length,
            task,
          });
        },
      },
    );

    created += Number(res?.created ?? 0);
    skipped += Number(res?.skipped ?? 0);
    failures.push(...offsetImportFailures(Array.isArray(res?.failures) ? res.failures : [], offset));
  }

  return {
    created,
    skipped,
    failures,
    failed: failures.length,
  };
}
