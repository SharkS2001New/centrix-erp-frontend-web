import { apiRequest } from "@/lib/api";

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

/** Paginate a list endpoint without firing unbounded parallel page requests. */
export async function fetchAllPages(path, searchParams = {}, options = {}) {
  const perPage = options.perPage ?? 200;
  const all = [];
  let pageNum = 1;
  let lastPage = 1;

  do {
    const res = await apiRequest(path, {
      searchParams: { ...searchParams, page: pageNum, per_page: perPage },
    });
    all.push(...(res.data ?? []));
    lastPage = res.last_page ?? 1;
    pageNum += 1;
  } while (pageNum <= lastPage);

  return all;
}
