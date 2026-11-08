import { drivingGet } from "@/lib/driving/api";

const TTL_MS = 5 * 60_000;
/** @type {Map<string, { at: number, data: any, promise?: Promise<any> }>} */
const cache = new Map();

function rowsOf(payload) {
  if (!payload) return [];
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}

async function cached(key, loader) {
  const hit = cache.get(key);
  if (hit?.data && Date.now() - hit.at < TTL_MS) return hit.data;
  if (hit?.promise) return hit.promise;
  const promise = loader()
    .then((data) => {
      cache.set(key, { at: Date.now(), data });
      return data;
    })
    .catch((err) => {
      cache.delete(key);
      throw err;
    });
  cache.set(key, { at: 0, data: null, promise });
  return promise;
}

export function invalidateDrivingReference(...keys) {
  if (!keys.length) {
    cache.clear();
    return;
  }
  for (const key of keys) cache.delete(key);
}

export function fetchDrivingCoursesCached() {
  return cached("courses", async () => rowsOf(await drivingGet("/courses", { per_page: 100 })));
}

export function fetchDrivingInstructorsCached() {
  return cached("instructors", async () => rowsOf(await drivingGet("/instructors", { per_page: 100 })));
}

export function fetchDrivingVehiclesCached() {
  return cached("vehicles", async () => rowsOf(await drivingGet("/vehicles", { per_page: 100 })));
}
