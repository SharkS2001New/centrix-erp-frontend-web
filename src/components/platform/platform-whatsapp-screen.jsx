"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell, Field, PrimaryButton, SECONDARY_BTN_CLASS, inputClassName } from "@/components/catalog/catalog-shared";
import {
  platformWhatsappFormFromApi,
  platformWhatsappPayloadFromForm,
} from "@/lib/whatsapp-settings";
import { notifyError, notifySuccess } from "@/lib/notify";

function WhatsappFields({ form, setForm, loading, saving, onSave, onCopy }) {
  return (
    <section className="max-w-2xl theme-panel rounded-xl border p-6 shadow-sm">
      <h2 className="text-sm font-semibold theme-heading">Platform webhook</h2>
      <p className="mt-1 text-sm theme-subtext">
        Register this callback URL once in the Meta WhatsApp Cloud API app. Incoming messages are routed to the
        correct organization by matching the phone number ID each tenant saves in their settings.
      </p>

      {loading ? (
        <p className="mt-4 text-sm theme-subtext">Loading…</p>
      ) : (
        <div className="mt-5 space-y-4">
          <Field label="Webhook URL">
            <div className="flex gap-2">
              <input className={inputClassName()} value={form.webhook_url} readOnly />
              <PrimaryButton type="button" showIcon={false} onClick={() => void onCopy()}>
                Copy
              </PrimaryButton>
            </div>
            <p className="mt-1 text-xs theme-subtext">
              Callback path: <span className="font-mono">/api/v1/webhooks/whatsapp</span>
            </p>
          </Field>

          <Field label="Webhook verify token">
            <input
              type="password"
              className={inputClassName()}
              value={form.webhook_verify_token}
              onChange={(e) => setForm((f) => ({ ...f, webhook_verify_token: e.target.value }))}
              placeholder={
                form.webhook_verify_token_set
                  ? form.webhook_verify_token_hint || "••••••••"
                  : "Choose a secret token"
              }
              autoComplete="off"
            />
            {form.webhook_verify_token_set && !form.webhook_verify_token ? (
              <p className="mt-1 text-xs theme-subtext">
                Leave blank to keep the current token ({form.webhook_verify_token_hint}). Enter the same value in
                Meta when subscribing the webhook.
              </p>
            ) : (
              <p className="mt-1 text-xs theme-subtext">
                Used during Meta webhook verification (hub.verify_token). Shared across all organizations.
              </p>
            )}
          </Field>

          <Field label="Default Graph API version">
            <input
              className={inputClassName()}
              value={form.graph_api_version}
              onChange={(e) => setForm((f) => ({ ...f, graph_api_version: e.target.value }))}
              placeholder="v21.0"
            />
            <p className="mt-1 text-xs theme-subtext">
              Organizations can override this in their own WhatsApp settings if needed.
            </p>
          </Field>

          <PrimaryButton type="button" showIcon={false} onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save platform settings"}
          </PrimaryButton>
        </div>
      )}
    </section>
  );
}

function WhatsappTestPanel() {
  const [organizations, setOrganizations] = useState([]);
  const [organizationId, setOrganizationId] = useState("");
  const [context, setContext] = useState(null);
  const [customerNum, setCustomerNum] = useState("");
  const [message, setMessage] = useState("HI");
  const [busy, setBusy] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [catalogQ, setCatalogQ] = useState("");
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [placeRealOrders, setPlaceRealOrders] = useState(false);
  const [botUserId, setBotUserId] = useState("");

  const loadOrganizations = useCallback(async () => {
    try {
      const res = await apiRequest("/admin/organizations", { loading: false });
      const rows = (res.data ?? []).filter(
        (org) => String(org.company_code || "").toUpperCase() !== "PLATFORM",
      );
      setOrganizations(rows);
    } catch {
      setOrganizations([]);
    }
  }, []);

  useEffect(() => {
    void loadOrganizations();
  }, [loadOrganizations]);

  const loadContext = useCallback(async (orgId) => {
    if (!orgId) {
      setContext(null);
      return;
    }
    setLoadingContext(true);
    try {
      const res = await apiRequest("/admin/whatsapp/preview/context", {
        searchParams: { organization_id: orgId },
        loading: false,
      });
      setContext(res);
      setCustomerNum(res.customers?.[0]?.customer_num || "");
      setBotUserId(
        res.default_live_bot_user_id
          ? String(res.default_live_bot_user_id)
          : res.org_users?.[0]?.id
            ? String(res.org_users[0].id)
            : "",
      );
      setTranscript([]);
      setSessionId(null);
      setCatalog(null);
      setPlaceRealOrders(false);
    } catch (err) {
      setContext(null);
      notifyError(err instanceof ApiError ? err.message : "Failed to load org WhatsApp preview.");
    } finally {
      setLoadingContext(false);
    }
  }, []);

  useEffect(() => {
    if (organizationId) void loadContext(organizationId);
  }, [organizationId, loadContext]);

  const selectedCustomer = useMemo(
    () => (context?.customers || []).find((c) => String(c.customer_num) === String(customerNum)),
    [context, customerNum],
  );
  const canPlaceRealOrders =
    Boolean(customerNum) &&
    Boolean(botUserId) &&
    Boolean(context?.preview_ready) &&
    (context?.org_users || []).length > 0;

  useEffect(() => {
    if (!canPlaceRealOrders && placeRealOrders) {
      setPlaceRealOrders(false);
    }
  }, [canPlaceRealOrders, placeRealOrders]);

  async function loadCatalog(page = 1, append = false, queryOverride) {
    if (!organizationId || !customerNum) {
      notifyError("Choose an organization and customer to preview products.");
      return;
    }
    const q = queryOverride !== undefined ? String(queryOverride).trim() : catalogQ.trim();
    setLoadingCatalog(true);
    try {
      const res = await apiRequest("/admin/whatsapp/preview/catalog", {
        searchParams: {
          organization_id: organizationId,
          customer_num: customerNum,
          ...(q ? { q } : {}),
          page,
        },
        loading: false,
      });
      if (append && catalog?.items?.length) {
        setCatalog({
          ...res,
          items: [...(catalog.items || []), ...(res.items || [])],
        });
      } else {
        setCatalog(res);
      }
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to load products.");
    } finally {
      setLoadingCatalog(false);
    }
  }

  async function sendTest(reset = false) {
    if (!organizationId) {
      notifyError("Choose a tenant organization.");
      return;
    }
    if (!message.trim()) {
      notifyError("Enter a customer message to simulate.");
      return;
    }
    if (placeRealOrders && !customerNum) {
      notifyError("Select a customer before placing real test orders.");
      return;
    }
    if (placeRealOrders && !botUserId) {
      notifyError("Select an organization user to act as the bot.");
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest("/admin/whatsapp/preview/simulate", {
        method: "POST",
        body: {
          organization_id: Number(organizationId),
          message: message.trim(),
          customer_num: customerNum || undefined,
          phone: selectedCustomer?.phone || undefined,
          session_id: sessionId || undefined,
          reset: Boolean(reset),
          place_real_orders: Boolean(placeRealOrders),
          bot_user_id: placeRealOrders && botUserId ? Number(botUserId) : undefined,
        },
      });
      setSessionId(res.session?.session_id || null);
      setTranscript((prev) => [
        ...(reset ? [] : prev),
        { role: "user", text: message.trim() },
        {
          role: "bot",
          text: res.reply,
          state: res.state,
          would_mutate: res.would_mutate || [],
          cart: res.cart || [],
          placed_order: res.placed_order || null,
          dry_run: res.dry_run !== false,
        },
      ]);
      setMessage("");
      if (res.placed_order?.order_num) {
        notifySuccess(
          `Live test order #${res.placed_order.order_num} created in ${res.organization_name || "the organization"}.`,
        );
      } else if ((res.would_mutate || []).includes("place_order")) {
        notifySuccess("Dry run: order was simulated only — org data was not changed.");
      } else if ((res.would_mutate || []).length) {
        notifySuccess("Dry run: mutation was simulated only — org data was not changed.");
      }
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Simulation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function resetChat() {
    setTranscript([]);
    setSessionId(null);
    setMessage("HI");
    if (!organizationId) return;
    setBusy(true);
    try {
      await apiRequest("/admin/whatsapp/preview/simulate", {
        method: "POST",
        body: {
          organization_id: Number(organizationId),
          message: "HI",
          customer_num: customerNum || undefined,
          phone: selectedCustomer?.phone || undefined,
          reset: true,
          place_real_orders: Boolean(placeRealOrders),
          bot_user_id: placeRealOrders && botUserId ? Number(botUserId) : undefined,
        },
      }).then((res) => {
        setSessionId(res.session?.session_id || null);
        setTranscript([
          { role: "user", text: "HI" },
          { role: "bot", text: res.reply, state: res.state, would_mutate: [], cart: res.cart || [] },
        ]);
        setMessage("");
      });
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not reset test chat.");
    } finally {
      setBusy(false);
    }
  }

  function onTogglePlaceRealOrders(checked) {
    if (checked && !customerNum) {
      notifyError("Select a customer before enabling live orders.");
      return;
    }
    if (checked && !botUserId) {
      notifyError("Select an organization user to act as the bot.");
      return;
    }
    if (checked && !(context?.org_users || []).length) {
      notifyError("This organization has no active users to act as the bot.");
      return;
    }
    setPlaceRealOrders(checked);
    setTranscript([]);
    setSessionId(null);
    setMessage("HI");
  }

  return (
    <section className="theme-panel mb-6 rounded-xl border p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold theme-heading">Test bot</h2>
          <p className="mt-1 text-sm theme-subtext">
            Pick a tenant organization to preview how WhatsApp ordering will feel for their customers.
            Uses that org’s products, customers, and sales rules. Optionally place a real order for
            end-to-end testing — WhatsApp messages are never sent from this screen.
          </p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
            placeRealOrders
              ? "border-rose-200 bg-rose-50 text-rose-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {placeRealOrders ? "Live orders" : "Dry run only"}
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="Organization">
            <select
              className={inputClassName()}
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
            >
              <option value="">— Select tenant —</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.org_name} ({org.company_code})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Customer (as the WhatsApp shopper)">
            <select
              className={inputClassName()}
              value={customerNum}
              onChange={(e) => {
                setCustomerNum(e.target.value);
                setTranscript([]);
                setSessionId(null);
                setCatalog(null);
              }}
              disabled={!context}
            >
              <option value="">— Unknown / unregistered phone —</option>
              {(context?.customers || []).map((c) => (
                <option key={c.customer_num} value={c.customer_num}>
                  {c.customer_name} ({c.customer_num})
                  {c.phone ? ` · ${c.phone}` : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Act as bot user (for live orders)">
            <select
              className={inputClassName()}
              value={botUserId}
              onChange={(e) => {
                setBotUserId(e.target.value);
                setTranscript([]);
                setSessionId(null);
              }}
              disabled={!context || !(context?.org_users || []).length}
            >
              <option value="">— Select org user —</option>
              {(context?.org_users || []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.username}
                  {u.username ? ` (@${u.username})` : ""}
                  {u.is_admin ? " · admin" : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs theme-subtext">
              Used as the ordering user when “Place real orders” is enabled. Dry run still uses the
              configured WhatsApp bot / platform admin stand-in.
            </p>
          </Field>

          {loadingContext ? <p className="text-sm theme-subtext">Loading organization…</p> : null}
          {context ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <p>{context.notice}</p>
              <p className="mt-1">
                Preview ready: {context.preview_ready ? "yes" : "no"}
                {context.preview_bot_user?.username
                  ? ` · bot @${context.preview_bot_user.username}${
                      context.using_platform_admin_bot ? " (platform admin)" : ""
                    }`
                  : context.bot_user?.username
                    ? ` · bot @${context.bot_user.username}`
                    : ""}
                {context.configured ? " · Meta credentials complete" : " · credentials incomplete (dry-run OK)"}
              </p>
              {(context.issues || []).length ? (
                <ul className="mt-2 list-inside list-disc text-amber-900">
                  {context.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${
              placeRealOrders
                ? "border-rose-300 bg-rose-50/80"
                : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <input
              type="checkbox"
              className="mt-1"
              checked={placeRealOrders}
              disabled={!organizationId || busy}
              onChange={(e) => onTogglePlaceRealOrders(e.target.checked)}
            />
            <span>
              <span className="font-medium text-slate-900">Place real orders in this organization</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                When enabled, CONFIRM creates a real WhatsApp-sourced order as the selected org user
                (stock and workflow follow this org’s settings). No WhatsApp messages are sent.
              </span>
              {placeRealOrders ? (
                <span className="mt-1 block text-xs font-medium text-rose-800">
                  Live mode is on — orders will appear in the tenant’s sales queue.
                </span>
              ) : null}
              {!canPlaceRealOrders && organizationId ? (
                <span className="mt-1 block text-xs text-amber-800">
                  {!customerNum
                    ? "Select a customer to enable live orders."
                    : !botUserId
                      ? "Select an organization user to act as the bot."
                      : "This organization has no active users available."}
                </span>
              ) : null}
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={SECONDARY_BTN_CLASS}
              disabled={!organizationId || !customerNum || loadingCatalog}
              onClick={() => {
                setCatalogQ("");
                void loadCatalog(1, false, "");
              }}
            >
              {loadingCatalog ? "Loading…" : "Preview products"}
            </button>
            <button
              type="button"
              className={SECONDARY_BTN_CLASS}
              disabled={!organizationId || busy}
              onClick={() => void resetChat()}
            >
              Reset chat
            </button>
          </div>

          <div className="flex gap-2">
            <input
              className={inputClassName()}
              value={catalogQ}
              onChange={(e) => setCatalogQ(e.target.value)}
              placeholder="Search products by name or code…"
              disabled={!organizationId || !customerNum}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void loadCatalog(1, false);
                }
              }}
            />
            <button
              type="button"
              className={SECONDARY_BTN_CLASS}
              disabled={!organizationId || !customerNum || loadingCatalog}
              onClick={() => void loadCatalog(1, false)}
            >
              Search
            </button>
          </div>

          {catalog ? (
            <div className="space-y-2">
              <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Code</th>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2">Unit price</th>
                      <th className="px-3 py-2">Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(catalog.items || []).map((item) => (
                      <tr key={item.product_code || item.code}>
                        <td className="px-3 py-2 font-mono">{item.product_code || item.code}</td>
                        <td className="px-3 py-2">{item.product_name || item.name}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {item.sell_on_retail && item.retail_unit_price != null
                            ? `W ${Number(item.wholesale_unit_price ?? item.unit_price ?? 0).toLocaleString()} / R ${Number(item.retail_unit_price).toLocaleString()}`
                            : item.unit_price != null || item.wholesale_unit_price != null
                              ? Number(item.wholesale_unit_price ?? item.unit_price).toLocaleString()
                              : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {item.available_display ?? item.display_qty ?? item.stock_display ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(catalog.items || []).length === 0 ? (
                  <p className="px-3 py-4 text-sm text-slate-500">
                    No products found
                    {catalogQ.trim() ? ` matching “${catalogQ.trim()}”` : " in stock"}.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>
                  Showing {(catalog.items || []).length}
                  {catalog.total != null ? ` of ${catalog.total}` : ""} product
                  {(catalog.items || []).length === 1 ? "" : "s"}
                  {catalogQ.trim() ? " (includes zero stock)" : " (in stock)"}
                </span>
                {catalog.has_more ? (
                  <button
                    type="button"
                    className={SECONDARY_BTN_CLASS}
                    disabled={loadingCatalog}
                    onClick={() => void loadCatalog((catalog.page || 1) + 1, true)}
                  >
                    {loadingCatalog ? "Loading…" : "Load more"}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex h-[min(36rem,calc(100svh-8.5rem))] max-h-[calc(100svh-8.5rem)] min-h-[18rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:sticky lg:top-4 lg:self-start">
          <div className="shrink-0 border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Simulated chat</p>
            <p className="text-xs text-slate-500">
              Type what a customer would send (Hi, Hello, 1, product name, CONFIRM…). Replies mirror production bot text.
            </p>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {transcript.length === 0 ? (
              <p className="text-sm text-slate-500">
                Start with a greeting like <span className="font-mono">Hi</span> or <span className="font-mono">Hello</span>, or click Reset chat.
              </p>
            ) : (
              transcript.map((row, index) => (
                <div
                  key={`${row.role}-${index}`}
                  className={`max-w-[95%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                    row.role === "user"
                      ? "ml-auto bg-[#185FA5] text-white"
                      : "mr-auto bg-slate-100 text-slate-900"
                  }`}
                >
                  {row.text}
                  {row.role === "bot" && row.placed_order?.order_num ? (
                    <p className="mt-2 rounded-lg bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-950">
                      Live order #{row.placed_order.order_num} saved in this organization
                    </p>
                  ) : null}
                  {row.role === "bot" && !row.placed_order && (row.would_mutate || []).length ? (
                    <p className="mt-2 rounded-lg bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-950">
                      Simulated only: {(row.would_mutate || []).join(", ")} — org data unchanged
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </div>
          <div className="flex shrink-0 gap-2 border-t border-slate-100 p-3">
            <input
              className={inputClassName()}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Customer message…"
              disabled={busy || !organizationId}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void sendTest(false);
                }
              }}
            />
            <PrimaryButton
              type="button"
              showIcon={false}
              disabled={busy || !organizationId}
              onClick={() => void sendTest(false)}
            >
              {busy ? "…" : "Send"}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </section>
  );
}

export function PlatformWhatsappScreen({ embedded = false } = {}) {
  const [form, setForm] = useState(platformWhatsappFormFromApi({}));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/whatsapp/settings");
      setForm(platformWhatsappFormFromApi(res));
    } catch {
      setForm(platformWhatsappFormFromApi({}));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  async function saveSettings() {
    setSaving(true);
    try {
      const res = await apiRequest("/admin/whatsapp/settings", {
        method: "PATCH",
        body: platformWhatsappPayloadFromForm(form),
      });
      setForm(platformWhatsappFormFromApi(res));
      notifySuccess("Platform WhatsApp settings saved.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to save platform WhatsApp settings.");
    } finally {
      setSaving(false);
    }
  }

  async function copyWebhookUrl() {
    if (!form.webhook_url) return;
    try {
      await navigator.clipboard.writeText(form.webhook_url);
      notifySuccess("Webhook URL copied.");
    } catch {
      notifyError("Could not copy webhook URL.");
    }
  }

  const body = (
    <div className="space-y-4">
      <WhatsappFields
        form={form}
        setForm={setForm}
        loading={loading}
        saving={saving}
        onSave={saveSettings}
        onCopy={copyWebhookUrl}
      />
      <p className="text-sm theme-subtext">
        To dry-run the ordering bot against a tenant, open{" "}
        <a href="/platform/whatsapp" className="font-medium text-[#185FA5] hover:underline">
          Integrations → WhatsApp
        </a>
        .
      </p>
    </div>
  );

  if (embedded) {
    return body;
  }

  return (
    <CatalogPageShell
      title="WhatsApp"
      subtitle="Shared webhook URL and verify token for all tenant organizations. Each org configures its own Meta credentials under Administration → Organization settings."
    >
      <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "WhatsApp" }]} />
      {body}
    </CatalogPageShell>
  );
}

export function PlatformWhatsappTestScreen() {
  return (
    <CatalogPageShell
      title="WhatsApp"
      subtitle="Dry-run the ordering bot against a tenant organization. Webhook URL and verify token stay under Platform settings."
    >
      <AdminBreadcrumb
        items={[
          { label: "Platform", href: "/platform" },
          { label: "WhatsApp" },
        ]}
      />
      <div className="mb-4 text-sm theme-subtext">
        Shared Meta webhook configuration:{" "}
        <a href="/platform/settings?tab=whatsapp" className="font-medium text-[#185FA5] hover:underline">
          Platform settings → WhatsApp
        </a>
        .
      </div>
      <WhatsappTestPanel />
    </CatalogPageShell>
  );
}
