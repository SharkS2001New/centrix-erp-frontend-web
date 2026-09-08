import { describe, expect, it } from "vitest";
import {
  KRA_AGENT_COMSTORE_DEFAULT,
  applyKraConnectionMethod,
  financePayloadFromForm,
} from "./finance-settings";

describe("applyKraConnectionMethod", () => {
  it("switches to agent and stashes the direct device URL", () => {
    const next = applyKraConnectionMethod(
      {
        enable_kra_agent: false,
        kra_device_ip: "http://192.168.1.50:8010",
        kra_direct_device_ip: "",
        kra_agent_comstore_url: "",
      },
      true,
    );
    expect(next.enable_kra_agent).toBe(true);
    expect(next.kra_device_ip).toBe(KRA_AGENT_COMSTORE_DEFAULT);
    expect(next.kra_direct_device_ip).toBe("http://192.168.1.50:8010");
  });

  it("switches to direct and restores the stashed device URL", () => {
    const next = applyKraConnectionMethod(
      {
        enable_kra_agent: true,
        kra_device_ip: "http://127.0.0.1:4000",
        kra_direct_device_ip: "http://192.168.1.50:8010",
        kra_agent_comstore_url: "http://127.0.0.1:4000",
      },
      false,
    );
    expect(next.enable_kra_agent).toBe(false);
    expect(next.kra_device_ip).toBe("http://192.168.1.50:8010");
    expect(next.kra_agent_comstore_url).toBe("http://127.0.0.1:4000");
  });
});

describe("financePayloadFromForm kra exclusivity", () => {
  it("persists agent mode with stashed direct URL", () => {
    const payload = financePayloadFromForm(
      {
        enable_kra_device: true,
        enable_kra_agent: true,
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
    expect(payload.kra_direct_device_ip).toBe("http://192.168.1.50:8010");
  });
});
