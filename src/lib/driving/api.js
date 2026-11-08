import { apiRequest } from "@/lib/api";

/** Soft by default — Driving School screens manage their own loading UI. */
export function drivingGet(path, searchParams, options = {}) {
  return apiRequest(`/driving-school${path}`, {
    searchParams,
    loading: false,
    ...options,
  });
}

export function drivingSend(path, method, body, options = {}) {
  return apiRequest(`/driving-school${path}`, {
    method,
    body,
    ...options,
  });
}
