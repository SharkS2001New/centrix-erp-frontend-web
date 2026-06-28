import { finishNavigation, isNavigationPending } from "./app-loading";

/** Call when a page finished its initial data load (for routes that opt out of global fetch tracking). */
export function signalPageDataReady() {
  if (isNavigationPending()) {
    finishNavigation();
  }
}
