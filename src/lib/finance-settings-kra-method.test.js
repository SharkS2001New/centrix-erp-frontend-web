import { describe, expect, it } from "vitest";
import {
  KRA_AGENT_COMSTORE_DEFAULT,
  canDownloadKraAgent,
  ensureKraAgentMode,
  financePayloadFromForm,
  kraAgentSettingsFingerprint,
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
  });
});

describe("canDownloadKraAgent", () => {
  const base = {
    enable_kra_device: true,
    kra_device_ip: "http://localhost:4000",
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

  it("requires device, comstore URL, serial, and PIN", () => {
    const saved = kraAgentSettingsFingerprint(base);
    expect(canDownloadKraAgent({ ...base, enable_kra_device: false }, saved)).toBe(false);
    expect(canDownloadKraAgent({ ...base, kra_serial_number: "" }, saved)).toBe(false);
  });
});
