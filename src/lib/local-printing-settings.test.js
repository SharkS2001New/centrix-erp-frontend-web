import { describe, expect, it } from "vitest";
import {
  agentConfigFromLocalPrinting,
  mergeLocalPrintingSettings,
  normalizeLocalPrintingSettings,
  qzConfigFromLocalPrinting,
  resolveHotelKitchenPrinterName,
} from "@/lib/local-printing-settings";

describe("local-printing-settings", () => {
  it("defaults to browser", () => {
    expect(normalizeLocalPrintingSettings({})).toMatchObject({
      provider: "browser",
      fallback_to_browser: true,
      require_qz: false,
    });
  });

  it("maps legacy QZ settings to browser", () => {
    const merged = mergeLocalPrintingSettings({
      local_printing: { provider: "qz", printer_name: "EPSON", use_signing: true },
    });
    expect(merged.provider).toBe("browser");
    expect(merged.printer_name).toBe("EPSON");
    expect(merged.use_signing).toBe(true);
    expect(qzConfigFromLocalPrinting(merged)).toMatchObject({
      enabled: false,
      printerName: "EPSON",
      useSigning: true,
    });
  });

  it("merges module_settings.local_printing for agent", () => {
    const merged = mergeLocalPrintingSettings({
      local_printing: { provider: "print-agent", printer_name: "Star TSP143" },
    });
    expect(merged.provider).toBe("agent");
    expect(agentConfigFromLocalPrinting(merged)).toMatchObject({
      enabled: true,
      printerName: "Star TSP143",
      kitchenPrinterName: "",
      baseUrl: "http://127.0.0.1:9247",
    });
    expect(qzConfigFromLocalPrinting(merged).enabled).toBe(false);
  });

  it("always keeps browser fallback on", () => {
    const merged = mergeLocalPrintingSettings({
      local_printing: {
        provider: "agent",
        fallback_to_browser: false,
        require_qz: true,
      },
    });
    expect(merged.fallback_to_browser).toBe(true);
    expect(merged.require_qz).toBe(false);
  });

  it("keeps a kitchen printer distinct from the preferred till printer", () => {
    const merged = mergeLocalPrintingSettings({
      local_printing: {
        provider: "agent",
        printer_name: "Star TSP143",
        kitchen_printer_name: "Kitchen EPSON",
      },
    });
    expect(merged.kitchen_printer_name).toBe("Kitchen EPSON");
    expect(merged.second_copy_enabled).toBe(true);
    expect(resolveHotelKitchenPrinterName(merged)).toBe("Kitchen EPSON");
    expect(resolveHotelKitchenPrinterName({ printer_name: "Star", kitchen_printer_name: "Star" })).toBe(
      "",
    );
    expect(resolveHotelKitchenPrinterName({ kitchen_printer_name: "" })).toBe("");
  });

  it("leaves the second copy off until explicitly enabled", () => {
    expect(normalizeLocalPrintingSettings({}).second_copy_enabled).toBe(false);
    expect(
      resolveHotelKitchenPrinterName({
        second_copy_enabled: false,
        kitchen_printer_name: "Office EPSON",
        printer_name: "Till",
      }),
    ).toBe("");
    expect(
      resolveHotelKitchenPrinterName({
        second_copy_enabled: true,
        kitchen_printer_name: "Office EPSON",
        printer_name: "Till",
      }),
    ).toBe("Office EPSON");
  });
});
