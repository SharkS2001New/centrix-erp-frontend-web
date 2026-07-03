/** Org columns are implicit from the signed-in tenant. */
const HIDDEN_ORG_COLUMNS = new Set(["organization_id", "organization_name"]);

/** Branch id is redundant when the organization has a single branch. */
const HIDDEN_SINGLE_BRANCH_COLUMNS = new Set(["branch_id"]);

/**
 * @param {string} key
 * @param {{ multiBranch?: boolean }} [options]
 */
export function isRedundantReportColumn(key, { multiBranch = false } = {}) {
  if (HIDDEN_ORG_COLUMNS.has(key)) return true;
  if (!multiBranch && HIDDEN_SINGLE_BRANCH_COLUMNS.has(key)) return true;
  return false;
}

/**
 * @param {string[]} keys
 * @param {{ multiBranch?: boolean }} [options]
 */
export function filterReportColumnKeys(keys, options = {}) {
  return keys.filter((key) => !key.startsWith("_") && !isRedundantReportColumn(key, options));
}
