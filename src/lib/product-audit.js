/** @param {object | null | undefined} product */
export function resolveProductAudit(product, userById) {
  if (!product) {
    return { label: "Created by", name: "—", date: null };
  }

  const hasUpdater = product.updated_by != null;
  const userId = hasUpdater ? product.updated_by : product.created_by;
  const date = hasUpdater ? product.updated_at : product.created_at;
  const user = userById?.get?.(userId);

  return {
    label: hasUpdater ? "Updated by" : "Created by",
    name: user?.full_name ?? user?.username ?? "—",
    date,
  };
}
