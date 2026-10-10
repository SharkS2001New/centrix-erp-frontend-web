import { apiRequest } from "@/lib/api";

export function drivingGet(path, searchParams) {
  return apiRequest(`/driving-school${path}`, { searchParams });
}

export function drivingSend(path, method, body) {
  return apiRequest(`/driving-school${path}`, { method, body });
}
