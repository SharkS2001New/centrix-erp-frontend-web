import { apiRequest } from "@/lib/api";
import { runQueuedTask } from "@/lib/background-task";
import { queueReportRun } from "@/lib/report-export-api";

const DEFAULT_PER_PAGE = 200;
const QUEUED_PAGE_THRESHOLD = 3;
const QUEUED_ROW_THRESHOLD = 200;
const PAGE_DELAY_MS = 60;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch remaining pages sequentially with a short pause to avoid rate limits. */
async function fetchRemainingPages(apiPath, baseSearchParams, startPage, lastPage, perPage) {
  const all = [];
  for (let pageNum = startPage; pageNum <= lastPage; pageNum += 1) {
    if (pageNum > startPage) {
      await sleep(PAGE_DELAY_MS);
    }
    const res = await apiRequest(apiPath, {
      searchParams: { ...baseSearchParams, page: pageNum, per_page: perPage },
    });
    all.push(...(res.data ?? []));
  }
  return all;
}

/**
 * Load a full report dataset, queueing when the API spans many pages or rows.
 * @param {string} apiPath
 * @param {Record<string, unknown>} [baseSearchParams]
 * @param {{ onProgress?: Function, message?: string, totalHint?: number }} [options]
 */
export async function loadFullReportDataset(apiPath, baseSearchParams = {}, options = {}) {
  const perPage = options.perPage ?? DEFAULT_PER_PAGE;
  const first = await apiRequest(apiPath, {
    searchParams: { ...baseSearchParams, page: 1, per_page: perPage },
  });
  const lastPage = first.last_page ?? first.meta?.last_page ?? 1;
  const total = first.meta?.total ?? first.total ?? (first.data ?? []).length;
  const firstRows = first.data ?? [];

  if (lastPage <= 1 && total <= QUEUED_ROW_THRESHOLD) {
    return firstRows;
  }

  if (lastPage <= QUEUED_PAGE_THRESHOLD && total <= 1000) {
    if (lastPage <= 1) return firstRows;
    const rest = await fetchRemainingPages(apiPath, baseSearchParams, 2, lastPage, perPage);
    return [...firstRows, ...rest];
  }

  const queued = await runQueuedTask(
    () => queueReportRun(apiPath, baseSearchParams),
    {
      message: options.message ?? "Loading full report…",
      onProgress: options.onProgress,
    },
  );

  return queued.rows ?? [];
}

/**
 * Fetch all pages — uses a background queue when the result spans many pages.
 * @param {string} apiPath
 * @param {Record<string, unknown>} [baseSearchParams]
 * @param {{ onProgress?: Function, message?: string }} [options]
 */
export async function fetchAllPaginatedRowsSmart(apiPath, baseSearchParams = {}, options = {}) {
  const perPage = options.perPage ?? DEFAULT_PER_PAGE;
  const first = await apiRequest(apiPath, {
    searchParams: { ...baseSearchParams, page: 1, per_page: perPage },
  });
  const lastPage = first.last_page ?? first.meta?.last_page ?? 1;
  const firstRows = first.data ?? [];

  if (lastPage <= QUEUED_PAGE_THRESHOLD) {
    if (lastPage <= 1) return firstRows;
    const rest = await fetchRemainingPages(apiPath, baseSearchParams, 2, lastPage, perPage);
    return [...firstRows, ...rest];
  }

  const queued = await runQueuedTask(
    () =>
      apiRequest("/background-tasks/paginated-fetch", {
        method: "POST",
        body: {
          path: apiPath,
          search_params: baseSearchParams,
        },
      }),
    {
      message: options.message ?? "Please wait while we load the full dataset…",
      onProgress: options.onProgress,
    },
  );

  return queued.rows ?? [];
}

/**
 * Load reference data in two phases: critical requests first, then deferred with concurrency cap.
 * @param {{ critical?: Array<() => Promise<unknown>>, deferred?: Array<() => Promise<unknown>>, concurrency?: number }} config
 */
export async function loadReferenceDataPhased({ critical = [], deferred = [], concurrency = 3 } = {}) {
  const { mapWithConcurrency } = await import("@/lib/api-concurrency");
  const criticalResults = critical.length ? await Promise.all(critical.map((fn) => fn())) : [];
  const deferredResults = deferred.length
    ? await mapWithConcurrency(deferred, (fn) => fn(), concurrency)
    : [];
  return { criticalResults, deferredResults };
}
