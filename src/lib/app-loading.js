/** Module-level loading counter for global preloader (no React dependency). */

let pendingCount = 0;
let activeLabel = "Loading…";
/** True while a destination page may still be fetching data. */
let pageNavigationActive = false;
/** True from link click until the new page has settled (blocks duplicate navigations). */
let navigating = false;
/** Destination path for page-driven skeletons (set on click, cleared when navigation finishes). */
let pendingHref = null;
/** @type {Set<(state: { pending: number, label: string, navigating: boolean, pendingHref: string | null }) => void>} */
const listeners = new Set();

function emit() {
  const state = {
    pending: pendingCount,
    label: activeLabel,
    navigating,
    pendingHref,
    pageNavigationActive,
  };
  listeners.forEach((listener) => listener(state));
}

/** @param {(state: { pending: number, label: string, navigating: boolean, pendingHref: string | null, pageNavigationActive: boolean }) => void} listener */
export function subscribeAppLoading(listener) {
  listeners.add(listener);
  listener({
    pending: pendingCount,
    label: activeLabel,
    navigating,
    pendingHref,
    pageNavigationActive,
  });
  return () => listeners.delete(listener);
}

/** Call when the app route changes (page open / navigation). */
export function beginPageNavigation() {
  pageNavigationActive = true;
}

/** Ends the page-navigation loading window (also called when all loaders finish). */
export function endPageNavigation() {
  pageNavigationActive = false;
}

export function isPageNavigationLoading() {
  return pageNavigationActive;
}

export function isNavigationPending() {
  return navigating;
}

export function getPendingHref() {
  return pendingHref;
}

/** @type {Set<() => void>} */
const navigationSealListeners = new Set();

/**
 * Register a sync callback that runs at the start of beginNavigationIntent —
 * before Next soft-nav can swap the live page tree. Used to freeze tab panes.
 */
export function subscribeNavigationSeal(listener) {
  navigationSealListeners.add(listener);
  return () => navigationSealListeners.delete(listener);
}

function emitNavigationSeal() {
  navigationSealListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* ignore seal listener errors */
    }
  });
}

/**
 * Call as soon as the user clicks an internal link (before the route changes).
 * Returns false when navigation is already in progress — caller should block the click.
 */
export function beginNavigationIntent(label = "Opening page…", href = null) {
  if (navigating) return false;
  // Seal keep-alive panes with the current live tree BEFORE children swap.
  emitNavigationSeal();
  navigating = true;
  pageNavigationActive = true;
  activeLabel = label;
  pendingHref = href;
  emit();
  return true;
}

export function finishNavigation() {
  if (!navigating && pendingCount === 0) {
    endPageNavigation();
    return;
  }
  navigating = false;
  pendingHref = null;
  if (pendingCount === 0) {
    activeLabel = "Loading…";
    endPageNavigation();
  }
  emit();
}

export function beginAppLoading(label) {
  pendingCount += 1;
  if (label) activeLabel = label;
  emit();
}

export function endAppLoading() {
  pendingCount = Math.max(0, pendingCount - 1);
  if (pendingCount === 0) {
    if (navigating) {
      finishNavigation();
    } else {
      activeLabel = "Loading…";
      endPageNavigation();
    }
  }
  emit();
}

export function getAppLoadingState() {
  return {
    pending: pendingCount,
    label: activeLabel,
    navigating,
    pendingHref,
    pageNavigationActive,
  };
}
