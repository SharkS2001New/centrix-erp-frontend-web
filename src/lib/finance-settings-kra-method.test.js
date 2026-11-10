import { describe, expect, it } from "vitest";
import {
  KRA_AGENT_COMSTORE_DEFAULT,
  canDownloadKraAgent,
  ensureKraAgentMode,
  financePayloadFromForm,
  financeFormFromApi,
  kraAgentSupportsComstoreApiKey,
  kraAgentSettingsFingerprint,
  kraSalesScopeAllowsChannel,
  normalizeKraSalesScope,
  shouldSubmitKraOnCheckout,
} from "./finance-settings";

describe("ensureKraAgentMode", () => {
  it("forces agent mode and stashes a leftover direct device URL", () => {
    const next = ensureKraAgentMode({
      enable_kra_agent: false,
      kra_device_ip: "http://192.168.1.50:8010",
      kra_direct_device_ip: "",
      kra_agent_comstore_url: "",
    });
    expect(next.enable_kra_agent).toBe(true);
    expect(next.kra_device_ip).toBe(KRA_AGENT_COMSTORE_DEFAULT);
    expect(next.kra_direct_device_ip).toBe("http://192.168.1.50:8010");
  });

  it("keeps an existing local Comstore URL", () => {
    const next = ensureKraAgentMode({
      enable_kra_agent: false,
      kra_device_ip: "http://127.0.0.1:4000",
      kra_direct_device_ip: "http://192.168.1.50:8010",
      kra_agent_comstore_url: "http://127.0.0.1:4000",
    });
    expect(next.enable_kra_agent).toBe(true);
    expect(next.kra_device_ip).toBe("http://127.0.0.1:4000");
  });
});

describe("financePayloadFromForm agent-only", () => {
  it("always persists enable_kra_agent when the device is enabled", () => {
    const payload = financePayloadFromForm(
      {
        enable_kra_device: true,
        enable_kra_agent: false,
        kra_device_ip: "http://localhost:4000",
        kra_direct_device_ip: "http://192.168.1.50:8010",
        kra_agent_comstore_url: "http://localhost:4000",
        kra_comstore_api_key: "my-comstore-key",
        kra_device_hardware_ip: "",
        kra_serial_number: "SN1",
        kra_pin_number: "P123",
        kra_device_test_mode: false,
        kra_plu_register_path: "/api/upload-plu-data",
        default_submit_kra: true,
        kra_bypass_above_amount: "",
        accounting_mode: "native",
        accounting_sync_direction: "export",
        mpesa: {},
        equity: {},
        quickbooks: {
          client_id: "",
          client_secret: "",
          redirect_uri: "",
          environment: "sandbox",
        },
      },
      { includeMpesa: false, includeEquity: false, includeAccounting: false },
    );
    expect(payload.enable_kra_agent).toBe(true);
    expect(payload.kra_device_ip).toBe("http://localhost:4000");
    expect(payload.kra_comstore_api_key).toBe("my-comstore-key");
  });

  it("keeps a masked saved Comstore API key unchanged", () => {
    const form = financeFormFromApi({ finance: { kra_comstore_api_key: "********" } });

    expect(financePayloadFromForm(form)).not.toHaveProperty("kra_comstore_api_key");
  });

  it("restores the masked key after saving and fingerprints key changes", () => {
    const saved = financeFormFromApi({ finance: { kra_comstore_api_key: "********" } });
    const changed = { ...saved, kra_comstore_api_key: "replacement-key" };

    expect(saved.kra_comstore_api_key).toBe("********");
    expect(kraAgentSettingsFingerprint(changed)).not.toBe(kraAgentSettingsFingerprint(saved));
  });
});

describe("kra sales scope", () => {
  it("maps legacy default_submit_kra to off/both", () => {
    expect(normalizeKraSalesScope({ default_submit_kra: false })).toBe("off");
    expect(normalizeKraSalesScope({ default_submit_kra: true })).toBe("both");
  });

  it("restricts channels by scope", () => {
    expect(kraSalesScopeAllowsChannel("mobile", "mobile")).toBe(true);
    expect(kraSalesScopeAllowsChannel("mobile", "pos")).toBe(false);
    expect(kraSalesScopeAllowsChannel("erp", "pos")).toBe(true);
    expect(kraSalesScopeAllowsChannel("erp", "backend")).toBe(true);
    expect(kraSalesScopeAllowsChannel("erp", "mobile")).toBe(false);
    expect(kraSalesScopeAllowsChannel("both", "mobile")).toBe(true);
  });

  it("persists kra_sales_scope on save and keeps default_submit_kra in sync", () => {
    const payload = financePayloadFromForm(
      {
        enable_kra_device: true,
        enable_kra_agent: true,
        kra_device_ip: "http://localhost:4000",
        kra_direct_device_ip: "",
        kra_agent_comstore_url: "http://localhost:4000",
        kra_comstore_api_key: "key",
        kra_device_hardware_ip: "",
        kra_serial_number: "SN1",
        kra_pin_number: "P123",
        kra_device_test_mode: false,
        kra_plu_register_path: "/api/upload-plu-data",
        kra_sales_scope: "mobile",
        default_submit_kra: true,
        kra_bypass_above_amount: "",
        accounting_mode: "native",
        accounting_sync_direction: "export",
        mpesa: {},
        equity: {},
        quickbooks: {
          client_id: "",
          client_secret: "",
          redirect_uri: "",
          environment: "sandbox",
        },
      },
      { includeMpesa: false, includeEquity: false, includeAccounting: false },
    );
    expect(payload.kra_sales_scope).toBe("mobile");
    expect(payload.default_submit_kra).toBe(true);
  });

  it("evaluates checkout fiscalization by channel", () => {
    const settings = {
      finance: {
        enable_kra_device: true,
        kra_sales_scope: "erp",
      },
    };
    expect(shouldSubmitKraOnCheckout(settings, null, 1000, "pos")).toBe(true);
    expect(shouldSubmitKraOnCheckout(settings, null, 1000, "mobile")).toBe(false);
    expect(shouldSubmitKraOnCheckout(settings, null, 1000)).toBe(true);
  });

  it("mobile-only scope fiscalizes field sales and skips POS", () => {
    const settings = {
      finance: {
        enable_kra_device: true,
        kra_sales_scope: "mobile",
      },
    };
    expect(shouldSubmitKraOnCheckout(settings, null, 1000, "mobile")).toBe(true);
    expect(shouldSubmitKraOnCheckout(settings, null, 1000, "centrix_as_mobile")).toBe(true);
    expect(shouldSubmitKraOnCheckout(settings, null, 1000, "pos")).toBe(false);
    expect(shouldSubmitKraOnCheckout(settings, null, 1000, "backend")).toBe(false);
  });

  it("erp-only scope fiscalizes POS/backoffice/hotel and skips mobile", () => {
    const settings = {
      finance: {
        enable_kra_device: true,
        kra_sales_scope: "erp",
      },
    };
    expect(shouldSubmitKraOnCheckout(settings, null, 1000, "pos")).toBe(true);
    expect(shouldSubmitKraOnCheckout(settings, null, 1000, "external_pos")).toBe(true);
    expect(shouldSubmitKraOnCheckout(settings, null, 1000, "backend")).toBe(true);
    expect(shouldSubmitKraOnCheckout(settings, null, 1000, "hotel_pos")).toBe(true);
    expect(shouldSubmitKraOnCheckout(settings, null, 1000)).toBe(true); // blank → POS
    expect(shouldSubmitKraOnCheckout(settings, null, 1000, "mobile")).toBe(false);
  });

  it("both scope fiscalizes every sales channel", () => {
    const settings = {
      finance: {
        enable_kra_device: true,
        kra_sales_scope: "both",
      },
    };
    expect(shouldSubmitKraOnCheckout(settings, null, 1000, "mobile")).toBe(true);
    expect(shouldSubmitKraOnCheckout(settings, null, 1000, "pos")).toBe(true);
    expect(shouldSubmitKraOnCheckout(settings, null, 1000, "backend")).toBe(true);
    expect(shouldSubmitKraOnCheckout(settings, null, 1000, "hotel_pos")).toBe(true);
  });
});

describe("canDownloadKraAgent", () => {
  const base = {
    enable_kra_device: true,
    kra_device_ip: "http://localhost:4000",
    kra_comstore_api_key: "test-comstore-key",
    kra_device_hardware_ip: "192.168.1.39",
    kra_serial_number: "SN1",
    kra_pin_number: "P123",
    kra_plu_register_path: "/api/upload-plu-data",
  };

  it("allows download only when the form matches the saved fingerprint", () => {
    const saved = kraAgentSettingsFingerprint(base);
    expect(canDownloadKraAgent(base, saved)).toBe(true);
    expect(canDownloadKraAgent({ ...base, kra_serial_number: "OTHER" }, saved)).toBe(false);
    expect(canDownloadKraAgent(base, null)).toBe(false);
  });

  describe("kraAgentSupportsComstoreApiKey", () => {
    it("requires agent version 1.3.8 or newer", () => {
      expect(kraAgentSupportsComstoreApiKey("1.3.7")).toBe(false);
      expect(kraAgentSupportsComstoreApiKey("1.3.8")).toBe(true);
      expect(kraAgentSupportsComstoreApiKey("1.4.0")).toBe(true);
      expect(kraAgentSupportsComstoreApiKey("invalid")).toBe(false);
    });
  });

  it("requires device, comstore URL, API key, serial, and PIN", () => {
    const saved = kraAgentSettingsFingerprint(base);
    expect(canDownloadKraAgent({ ...base, enable_kra_device: false }, saved)).toBe(false);
    expect(canDownloadKraAgent({ ...base, kra_serial_number: "" }, saved)).toBe(false);
    expect(canDownloadKraAgent({ ...base, kra_comstore_api_key: "" }, saved)).toBe(false);
  });
});
