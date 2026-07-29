/** Standard 80mm thermal roll — content inset so numeric columns do not clip at the edges. */
export const THERMAL_PAPER_WIDTH_MM = 80;
/** Side inset on body; many 80mm printers have ~2–3mm non-printable edge per side. */
export const THERMAL_SIDE_MARGIN_MM = 3;
export const THERMAL_CONTENT_WIDTH_MM = THERMAL_PAPER_WIDTH_MM - THERMAL_SIDE_MARGIN_MM * 2;

/** QZ Tray HTML pixel width (inches) — slightly under 80mm so drivers stay inside the printable area. */
export const THERMAL_QZ_PAGE_WIDTH_IN = 3.07;
