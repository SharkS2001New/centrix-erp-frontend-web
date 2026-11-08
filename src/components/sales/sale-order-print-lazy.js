/**
 * Lazy entry for POS print — keeps sale-order-print (+ invoice/receipt) out of the
 * initial POS chunk so classic/modern cart can paint first. Same API as printSaleOrder.
 */
export async function printSaleOrder(...args) {
  const mod = await import("@/components/sales/sale-order-print");
  return mod.printSaleOrder(...args);
}
