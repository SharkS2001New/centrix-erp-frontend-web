export function sidebarChildrenExpanded({ collapsedItems, childrenKey }) {
  return !collapsedItems.has(childrenKey);
}

export function toggleSidebarChildren(collapsedItems, childrenKey) {
  const next = new Set(collapsedItems);
  if (next.has(childrenKey)) {
    next.delete(childrenKey);
  } else {
    next.add(childrenKey);
  }
  return next;
}
