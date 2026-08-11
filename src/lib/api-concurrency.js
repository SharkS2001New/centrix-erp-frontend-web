/** Run async work over items with a max number of in-flight requests. */
export async function mapWithConcurrency(items, mapper, concurrency = 4) {
  if (!items?.length) return [];
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current], current);
    }
  }

  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

/** Paginate a list endpoint — routes large result sets through the background queue. */
export async function fetchAllPages(path, searchParams = {}, options = {}) {
  const { fetchAllPaginatedRowsSmart } = await import("@/lib/paginated-fetch");
  return fetchAllPaginatedRowsSmart(path, searchParams, {
    perPage: options.perPage ?? 200,
    message: options.message ?? "Please wait while we load the full dataset…",
    onProgress: options.onProgress,
  });
}
