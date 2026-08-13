/**
 * Org printout design templates (Admin → Printouts).
 * Same visual language as Platform Invoices; "default" preserves today's layouts.
 */

export const DEFAULT_DOCUMENT_TEMPLATE_ID = "default";

export const ORG_DOCUMENT_DESIGN_TEMPLATES = [
  {
    id: "default",
    label: "Default (current layout)",
    description: "Keep the existing invoice / proforma / credit note / LPO look unchanged.",
  },
  { id: "modern", label: "Modern", description: "Clean blue accent header — Stripe-inspired." },
  { id: "classic", label: "Classic formal", description: "Traditional bordered stationery with serif accents." },
  { id: "minimal", label: "Minimal", description: "Quiet whitespace and subtle dividers." },
  { id: "corporate", label: "Corporate", description: "Solid navy header band for enterprise clients." },
  { id: "bold", label: "Bold", description: "High-contrast red accents and strong totals." },
  { id: "elegant", label: "Elegant", description: "Warm serif accents — boutique / FreshBooks style." },
  { id: "stripe", label: "Stripe", description: "Purple accent sidebar — SaaS billing look." },
  { id: "compact", label: "Compact", description: "Denser spacing for multi-copy printing." },
  { id: "ocean", label: "Ocean", description: "Teal accents with a calm coastal feel." },
  { id: "forest", label: "Forest", description: "Deep green header for agri / eco brands." },
  { id: "sunset", label: "Sunset", description: "Warm orange accents — energetic retail." },
  { id: "slate", label: "Slate", description: "Neutral grey professional stationery." },
  { id: "indigo", label: "Indigo", description: "Deep indigo band — tech / SaaS friendly." },
  { id: "gold", label: "Gold", description: "Premium gold accents with ivory tone." },
  { id: "paper", label: "Paper", description: "Cream paper feel with classic rule lines." },
  { id: "ledger", label: "Ledger", description: "Accounting-style charcoal type and rules." },
  { id: "midnight", label: "Midnight", description: "Dark midnight header with crisp contrast." },
  { id: "emerald", label: "Emerald", description: "Bright emerald accents — growth / finance." },
  { id: "coastal", label: "Coastal", description: "Sky blue top bar and airy spacing." },
  { id: "graphite", label: "Graphite", description: "Matte graphite header — industrial polish." },
  { id: "ivory", label: "Ivory", description: "Soft ivory sheet with chocolate brown accents." },
  { id: "safari", label: "Safari", description: "Earth-tone brown accents — East Africa inspired." },
  { id: "rounded", label: "Rounded", description: "Friendly soft sky accents." },
];

export const ORG_DOCUMENT_TEMPLATE_IDS = ORG_DOCUMENT_DESIGN_TEMPLATES.map((row) => row.id);

const THEME_MAP = {
  modern: { accent: "#2563eb", bg: "#f8fafc", header: "top" },
  classic: { accent: "#1e293b", bg: "#ffffff", header: "plain", border: true, serif: true },
  minimal: { accent: "#64748b", bg: "#ffffff", header: "plain", flat: true },
  corporate: { accent: "#0f172a", bg: "#ffffff", header: "solid" },
  bold: { accent: "#dc2626", bg: "#ffffff", header: "solid" },
  elegant: { accent: "#78350f", bg: "#fffbeb", header: "top", serif: true },
  stripe: { accent: "#635bff", bg: "#ffffff", header: "stripe" },
  compact: { accent: "#334155", bg: "#ffffff", header: "top", compact: true },
  ocean: { accent: "#0d9488", bg: "#f0fdfa", header: "top" },
  forest: { accent: "#166534", bg: "#f7fee7", header: "solid" },
  sunset: { accent: "#ea580c", bg: "#fff7ed", header: "top" },
  slate: { accent: "#475569", bg: "#f8fafc", header: "solid" },
  indigo: { accent: "#4338ca", bg: "#eef2ff", header: "solid" },
  gold: { accent: "#b45309", bg: "#fffbeb", header: "top", serif: true },
  paper: { accent: "#78716c", bg: "#fafaf9", header: "plain", border: true, serif: true },
  ledger: { accent: "#1c1917", bg: "#ffffff", header: "top" },
  midnight: { accent: "#020617", bg: "#f8fafc", header: "solid" },
  emerald: { accent: "#059669", bg: "#ecfdf5", header: "top" },
  coastal: { accent: "#0284c7", bg: "#f0f9ff", header: "top" },
  graphite: { accent: "#374151", bg: "#f9fafb", header: "solid" },
  ivory: { accent: "#78350f", bg: "#fffdf7", header: "top", serif: true },
  safari: { accent: "#92400e", bg: "#fffbeb", header: "solid" },
  rounded: { accent: "#0ea5e9", bg: "#f0f9ff", header: "top", radius: "12px" },
};

/** Settings keys per printout kind. */
export const DOCUMENT_TEMPLATE_SETTING_KEYS = {
  invoice: "invoice_document_template",
  proforma: "proforma_document_template",
  credit_note: "credit_note_document_template",
  lpo: "lpo_document_template",
};

export function resolveOrgDocumentTemplateId(value) {
  const id = String(value ?? DEFAULT_DOCUMENT_TEMPLATE_ID).trim() || DEFAULT_DOCUMENT_TEMPLATE_ID;
  return ORG_DOCUMENT_TEMPLATE_IDS.includes(id) ? id : DEFAULT_DOCUMENT_TEMPLATE_ID;
}

export function orgDocumentTemplateMeta(templateId) {
  const id = resolveOrgDocumentTemplateId(templateId);
  return ORG_DOCUMENT_DESIGN_TEMPLATES.find((row) => row.id === id) ?? ORG_DOCUMENT_DESIGN_TEMPLATES[0];
}

export function orgDocumentTemplateTheme(templateId) {
  const id = resolveOrgDocumentTemplateId(templateId);
  if (id === DEFAULT_DOCUMENT_TEMPLATE_ID) return null;
  return THEME_MAP[id] ?? THEME_MAP.modern;
}

/**
 * Theme overlay CSS for org A4 documents.
 * @param {string} templateId
 * @param {{ layout?: "professional"|"classic" }} [options]
 */
export function orgDocumentTemplateCss(templateId, { layout = "professional" } = {}) {
  const theme = orgDocumentTemplateTheme(templateId);
  if (!theme) return "";

  const accent = theme.accent;
  const bg = theme.bg;
  const solid = theme.header === "solid";
  const stripe = theme.header === "stripe";
  const top = theme.header === "top";
  const compact = theme.compact === true;
  const radius = theme.radius || "0";
  const sheetBorder = theme.border ? `1px solid ${accent}` : "none";
  const serifHint = theme.serif
    ? "body { font-family: Georgia, 'Times New Roman', Times, serif; }"
    : "";

  const accentBar = top
    ? `.page::before, .page-body > .theme-accent-bar {
         content: "";
         display: block;
         height: 4px;
         background: ${accent};
         margin: 0 0 12px;
         border-radius: 2px;
       }`
    : stripe
      ? `.page, .page-body {
           border-left: 5px solid ${accent};
           padding-left: 10px;
         }`
      : solid
        ? `.doc-title {
             background: ${accent};
             color: #fff !important;
             text-decoration: none !important;
             padding: 10px 12px;
             letter-spacing: 0.14em;
             border-radius: ${radius};
           }
           .doc-title, .doc-title * { color: #fff !important; }`
        : "";

  if (layout === "classic") {
    return `
    /* Org document theme: ${resolveOrgDocumentTemplateId(templateId)} */
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { background: ${bg} !important; ${compact ? "font-size: 11px;" : ""} }
    ${serifHint}
    .page {
      background: #fff;
      ${theme.border ? `border: ${sheetBorder}; padding: 12px;` : ""}
      ${theme.radius ? `border-radius: ${radius};` : ""}
      ${top ? `border-top: 4px solid ${accent};` : ""}
      ${stripe ? `border-left: 5px solid ${accent}; padding-left: 10px;` : ""}
    }
    .doc-title {
      color: ${solid ? "#fff" : accent};
      ${solid ? `background: ${accent}; padding: 8px 10px; text-decoration: none;` : `text-decoration-color: ${accent};`}
      ${solid ? "border-radius: 4px;" : ""}
    }
    .org-brand .org-name, .brand-name { color: ${accent}; }
    table.items th {
      color: ${accent};
      border-top: 2px solid ${accent} !important;
      border-bottom: 2px solid ${accent} !important;
      background: ${accent}12;
    }
    table.items th, table.items td {
      border-top-color: ${accent}55 !important;
      border-bottom-color: ${accent}55 !important;
    }
    .totals-box .grand {
      color: ${accent};
      border-top: 2px solid ${accent};
    }
    .pay-instructions {
      border: 1px solid ${accent} !important;
      background: ${accent}08;
    }
    .pay-instructions .pay-title { color: ${accent}; }
    .meta-label { color: ${accent}; }
    @media print {
      body { background: #fff !important; }
    }
  `;
  }

  return `
    /* Org document theme: ${resolveOrgDocumentTemplateId(templateId)} */
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { background: ${bg} !important; ${compact ? "line-height: 1.3;" : ""} }
    ${serifHint}
    .page {
      background: #fff;
      ${theme.border ? `border: ${sheetBorder}; padding: 10px 12px;` : ""}
      ${theme.radius ? `border-radius: ${radius}; overflow: hidden;` : ""}
    }
    ${accentBar}
    .doc-title {
      color: ${solid ? "#fff" : accent};
      text-decoration-color: ${accent};
      ${solid ? "" : "border-bottom: 2px solid " + accent + "; text-decoration: none; padding-bottom: 6px;"}
    }
    .doc-banner {
      border-color: ${accent};
      color: ${accent};
      background: ${accent}10;
    }
    .company-block .company-name { color: ${accent}; }
    .pin-line { color: ${accent}; }
    table.pro-items {
      border-color: ${accent};
    }
    table.pro-items th,
    table.pro-items td {
      border-color: ${accent}99;
    }
    table.pro-items th {
      background: ${accent}14;
      color: ${accent};
    }
    table.pro-items tr.total-row td {
      background: ${accent}08;
    }
    .totals-box .grand {
      color: ${accent};
      border-top: 2px solid ${accent};
    }
    .pay-box, .pay-instructions {
      border-color: ${accent};
      background: ${accent}08;
    }
    .pay-box .pay-title, .pay-instructions .pay-title { color: ${accent}; }
    .party-meta .meta-label { color: ${accent}; }
    .terms h3 { color: ${accent}; }
    .footer-notes .warn { color: ${accent}; }
    @media print {
      body { background: #fff !important; }
    }
  `;
}

export function documentTemplateFormDefaults() {
  return {
    invoice_document_template: DEFAULT_DOCUMENT_TEMPLATE_ID,
    proforma_document_template: DEFAULT_DOCUMENT_TEMPLATE_ID,
    credit_note_document_template: DEFAULT_DOCUMENT_TEMPLATE_ID,
    lpo_document_template: DEFAULT_DOCUMENT_TEMPLATE_ID,
  };
}

export function documentTemplateFormFromSales(sales = {}) {
  return {
    invoice_document_template: resolveOrgDocumentTemplateId(sales.invoice_document_template),
    proforma_document_template: resolveOrgDocumentTemplateId(sales.proforma_document_template),
    credit_note_document_template: resolveOrgDocumentTemplateId(
      sales.credit_note_document_template,
    ),
  };
}

export function documentTemplateFormFromProcurement(procurement = {}) {
  return {
    lpo_document_template: resolveOrgDocumentTemplateId(procurement.lpo_document_template),
  };
}

export function documentTemplateSalesPayloadFromForm(form = {}) {
  return {
    invoice_document_template: resolveOrgDocumentTemplateId(form.invoice_document_template),
    proforma_document_template: resolveOrgDocumentTemplateId(form.proforma_document_template),
    credit_note_document_template: resolveOrgDocumentTemplateId(
      form.credit_note_document_template,
    ),
  };
}

export function documentTemplateProcurementPayloadFromForm(form = {}) {
  return {
    lpo_document_template: resolveOrgDocumentTemplateId(form.lpo_document_template),
  };
}

/** Preview panel: which form field drives the template for a preview kind. */
export function documentTemplateFieldForPreviewType(previewType) {
  return DOCUMENT_TEMPLATE_SETTING_KEYS[previewType] ?? null;
}
