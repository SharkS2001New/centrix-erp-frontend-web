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
 *   mode?: "draft" | "improve" | "shorten" | "formal",
 *   placeholders?: string[],
 * }} input
 */
export async function composePlatformEmailWithAi(input = {}) {
  const apiBase = aiTrainingApiBase();
  const mode = input.mode || (input.subject || input.body ? "improve" : "draft");
  const placeholders = input.placeholders ?? PLATFORM_EMAIL_PLACEHOLDERS;

  const payload = {
    task: "email",
    mode,
    use_knowledge: false,
    skip_training: true,
    instruction:
      input.instruction?.trim() ||
      (mode === "draft"
        ? "Draft a clear, professional Centrix ERP billing email for a Kenyan business customer."
        : "Improve this Centrix ERP email. Keep placeholders like {customer_name} unchanged."),
    subject: input.subject ?? "",
    body: input.body ?? "",
    placeholders,
    output_format: "json",
    system_hint:
      "You help the Centrix platform admin write outbound emails (contracts, quotes, renewals). " +
      "Return JSON only: {\"subject\":\"...\",\"body\":\"...\"}. " +
      "Keep template placeholders exactly as given. Tone: professional, concise, Kenya business English.",
  };

  const paths = [`${apiBase}/compose`, `${apiBase}/compose-email`];
  let lastError = null;

  for (const path of paths) {
    try {
      const res = await apiRequest(path, { method: "POST", body: payload });
      return normalizeComposeResult(res, {
        subject: input.subject,
        body: input.body,
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
      "Platform AI compose is not available yet. Save AI credentials under Platform → AI training → Credentials, then add POST /admin/ai-training/compose on the API.",
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
      "Platform AI compose is not available yet. Save AI credentials under Platform → AI training → Credentials.",
      404,
    )
  );
}
