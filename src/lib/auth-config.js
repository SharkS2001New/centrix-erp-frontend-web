export const useCookieAuth =
  process.env.NEXT_PUBLIC_USE_COOKIE_AUTH === "true";

export function apiFetchCredentials() {
  return useCookieAuth ? "include" : "same-origin";
}
