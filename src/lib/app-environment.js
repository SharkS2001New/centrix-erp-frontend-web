/** True for production Next.js builds (deployed environments). */
export function isProductionApp() {
  return process.env.NODE_ENV === "production";
}
