import { apiRequest, ApiError } from "@/lib/api";
import { aiTrainingApiBase } from "@/lib/platform-ai-training";

/**
 * Platform-admin AI compose (uses Platform → AI credentials keys).
 * No knowledge-base / training required — direct model call like a normal AI assistant.
 *
 * Preferred API: POST /admin/ai-training/compose
 * Fallback:     POST /admin/ai-training/compose-email
 */

export const PLATFORM_EMAIL_PLACEHOLDERS = [
  "{kind}",
  "{title}",
  "{reference}",
  "{customer_name}",
  "{first_payment}",
  "{renewal_payment}",
  "{from_name}",
];

function extractJsonObject(text) {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* continue */
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeComposeResult(res, fallback = {}) {
  const data = res?.data ?? res ?? {};
  const parsed =
    extractJsonObject(data.reply) ||
    extractJsonObject(data.content) ||
    extractJsonObject(data.message) ||
    null;

  const subject =
    data.subject ??
    parsed?.subject ??
    fallback.subject ??
    "";
  const body =
    data.body ??
    parsed?.body ??
    parsed?.message ??
    (typeof data.reply === "string" && !parsed ? data.reply : null) ??
    fallback.body ??
    "";

  return {
    subject: String(subject ?? "").trim(),
    body: String(body ?? "").trim(),
    raw: data,
  };
}

/**
 * Ask platform AI to draft or improve an email subject + body.
 * @param {{
 *   instruction?: string,
 *   subject?: string,
 *   body?: string,
 *   mode?: "draft" | "improve" | "shorten" | "formal" | "from_template" | "reply",
 *   placeholders?: string[],
 *   template?: { name?: string, subject?: string, body?: string } | null,
 *   context?: Record<string, string | number | null | undefined>,
 *   inboundEmail?: {
 *     subject?: string,
 *     from_address?: string,
 *     from_name?: string,
 *     body_text?: string,
 *   } | null,
 *   similarReplies?: Array<{
 *     subject?: string,
 *     body_text?: string,
 *     inbound_snippet?: string | null,
 *   }>,
 * }} input
 */
export async function composePlatformEmailWithAi(input = {}) {
  const apiBase = aiTrainingApiBase();
  const mode = input.mode || (input.subject || input.body ? "improve" : "draft");
  const placeholders = input.placeholders ?? PLATFORM_EMAIL_PLACEHOLDERS;
  const template = input.template ?? null;
  const context = input.context ?? {};
  const inboundEmail = input.inboundEmail ?? null;
  const similarReplies = Array.isArray(input.similarReplies) ? input.similarReplies : [];

  let instruction =
    input.instruction?.trim() ||
    (mode === "draft"
      ? "Draft a clear, professional Centrix ERP billing email for a Kenyan business customer."
      : mode === "from_template"
        ? "Adapt this saved email template for the new recipient/context. Keep the same structure and tone; only change details the user asked for."
        : mode === "reply"
          ? "Draft a professional reply to the inbound email. Prefer the tone and approach of similar past replies when provided."
          : "Improve this Centrix ERP email. Keep placeholders like {customer_name} unchanged.");

  if (mode === "from_template" && template) {
    const contextLines = Object.entries(context)
      .filter(([, value]) => value != null && String(value).trim() !== "")
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");
    instruction =
      `${instruction}\n\nSaved template name: ${template.name || "Untitled"}.\n` +
      "Use the template subject/body as the base. Apply the user's requested changes and any context below. " +
      "Replace obvious prior recipient/company details with the new context when provided.\n" +
      (contextLines ? `Context:\n${contextLines}\n` : "");
  }

  const subject = mode === "from_template" && template
    ? String(template.subject ?? input.subject ?? "")
    : (input.subject ?? "");
  const body = mode === "from_template" && template
    ? String(template.body ?? input.body ?? "")
    : (input.body ?? "");

  const payload = {
    task: "email",
    mode,
    use_knowledge: false,
    skip_training: true,
    instruction,
    subject,
    body,
    placeholders,
    output_format: "json",
    ...(inboundEmail
      ? {
          inbound_email: {
            subject: inboundEmail.subject ?? "",
            from_address: inboundEmail.from_address ?? "",
            from_name: inboundEmail.from_name ?? "",
            body_text: inboundEmail.body_text ?? "",
          },
        }
      : {}),
    ...(similarReplies.length ? { similar_replies: similarReplies } : {}),
    system_hint:
      mode === "reply"
        ? "You help the Centrix platform admin reply to inbound mailbox emails. " +
          "Read the inbound message and any past similar replies, then suggest a sensible response. " +
          "Match how similar emails were answered when memory is provided. " +
          "Return JSON only: {\"subject\":\"...\",\"body\":\"...\"}. Kenya business English, professional and concise."
        : mode === "from_template"
          ? "You help the Centrix platform admin reuse a saved email template. " +
            "Start from the provided template subject/body. Apply only the requested changes and new context. " +
            "Return JSON only: {\"subject\":\"...\",\"body\":\"...\"}. Kenya business English, professional and concise."
          : "You help the Centrix platform admin write outbound emails (contracts, quotes, renewals). " +
            "Return JSON only: {\"subject\":\"...\",\"body\":\"...\"}. " +
            "Keep template placeholders exactly as given. Tone: professional, concise, Kenya business English.",
  };

  const paths = [`${apiBase}/compose`, `${apiBase}/compose-email`];
  let lastError = null;

  for (const path of paths) {
    try {
      const res = await apiRequest(path, { method: "POST", body: payload });
      return normalizeComposeResult(res, {
        subject,
        body,
      });
    } catch (err) {
      lastError = err;
      if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
        continue;
      }
      throw err;
    }
  }

  throw (
    lastError ??
    new ApiError(
      "Platform AI compose is not available yet. Save AI credentials under Platform settings → AI credentials, then add POST /admin/ai-training/compose on the API.",
      404,
    )
  );
}

/**
 * Suggest title, reference, and related fields for a quote or contract.
 * @param {{
 *   kind?: "quote" | "contract",
 *   instruction?: string,
 *   form?: Record<string, unknown>,
 * }} input
 */
export async function composePlatformDocumentFieldsWithAi(input = {}) {
  const apiBase = aiTrainingApiBase();
  const kind = input.kind === "contract" ? "contract" : "quote";
  const form = input.form ?? {};
  const customer = String(form.customer_name || "").trim();
  const planHint = String(form.plan_name || form.plan_id || "").trim();
  const context = {
    kind,
    title: form.title ?? "",
    reference: form.reference ?? "",
    customer_name: form.customer_name ?? "",
    customer_email: form.customer_email ?? "",
    first_payment_price: form.first_payment_price ?? "",
    renewal_price: form.renewal_price ?? form.amount ?? "",
    interval: form.interval ?? "monthly",
    license_basis: form.license_basis ?? "org",
    seat_count: form.seat_count ?? 1,
    notes: form.notes ?? "",
  };

  const payload = {
    task: "document_fields",
    mode: "suggest",
    use_knowledge: false,
    skip_training: true,
    instruction:
      input.instruction?.trim() ||
      `Suggest a professional ${kind} title and reference for Centrix ERP SaaS billing` +
        (customer ? ` for ${customer}` : "") +
        (planHint ? ` (plan/context: ${planHint})` : "") +
        ". Also suggest a short internal notes line if helpful.",
    subject: String(form.title ?? ""),
    body: JSON.stringify(context, null, 2),
    output_format: "json",
    system_hint:
      "You help a Centrix platform admin name and label commercial documents. " +
      `Document kind is a ${kind}. ` +
      "A quote is a pre-commitment proposal; a contract is the binding agreement after acceptance. " +
      "Return JSON only with keys: title, reference, notes (optional short string). " +
      "Title should clearly say Quote or Contract and name the customer/plan when known. " +
      "Reference like Q-2026-001 for quotes or C-2026-001 for contracts. " +
      "Do not rewrite legal terms. Kenya business English.",
  };

  const paths = [`${apiBase}/compose`, `${apiBase}/compose-email`];
  let lastError = null;

  for (const path of paths) {
    try {
      const res = await apiRequest(path, { method: "POST", body: payload });
      const data = res?.data ?? res ?? {};
      const parsed =
        extractJsonObject(data.reply) ||
        extractJsonObject(data.content) ||
        extractJsonObject(data.message) ||
        (typeof data.body === "string" ? extractJsonObject(data.body) : null) ||
        (typeof data === "object" ? data : null);

      return {
        title: String(parsed?.title ?? data.title ?? data.subject ?? form.title ?? "").trim(),
        reference: String(parsed?.reference ?? data.reference ?? "").trim(),
        notes: String(parsed?.notes ?? data.notes ?? "").trim(),
        raw: data,
      };
    } catch (err) {
      lastError = err;
      if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
        continue;
      }
      throw err;
    }
  }

  throw (
    lastError ??
    new ApiError(
      "Platform AI compose is not available yet. Save AI credentials under Platform settings → AI credentials.",
      404,
    )
  );
}
