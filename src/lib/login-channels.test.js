import { describe, expect, it } from "vitest";
import {
  availableLoginChannelsFromCapabilities,
  formatLoginChannels,
  loginChannelLabel,
} from "@/lib/login-channels";

const hotelCaps = {
  industry: "hospitality",
  deployment_profile: "hotel_bar",
  modules: {
    "hospitality.backend": true,
    "hospitality.bar_pos": true,
    "sales.mobile": true,
    admin: true,
  },
  allowed_login_channels: ["backoffice", "centrix_as_mobile", "mobile", "manager"],
};

const retailCaps = {
  industry: "commerce",
  deployment_profile: "wholesale_retail",
  modules: {
    "sales.backend": true,
    "sales.pos": true,
    admin: true,
  },
  allowed_login_channels: ["backoffice", "pos", "manager"],
};

describe("hotel login channel labels", () => {
  it("labels hotel channels as Centrix ERP, CentrixAsMobile, and Managers App", () => {
    expect(loginChannelLabel("backoffice", hotelCaps)).toBe("Centrix ERP");
    expect(loginChannelLabel("centrix_as_mobile", hotelCaps)).toBe("CentrixAsMobile");
    expect(loginChannelLabel("manager", hotelCaps)).toBe("Managers App");
    expect(formatLoginChannels(["backoffice", "centrix_as_mobile", "manager"], hotelCaps)).toBe(
      "Centrix ERP, CentrixAsMobile, Managers App",
    );
    expect(availableLoginChannelsFromCapabilities(hotelCaps).map((c) => c.label)).toEqual([
      "Centrix ERP",
      "CentrixAsMobile",
      "CentrixFieldSales",
      "Managers App",
    ]);
  });

  it("labels SPA & Kinyozi web sign-in as Centrix ERP", () => {
    const spaCaps = {
      industry: "spa",
      deployment_profile: "spa_kinyozi",
      modules: { spa: true, admin: true },
      allowed_login_channels: ["backoffice"],
    };
    expect(loginChannelLabel("backoffice", spaCaps)).toBe("Centrix ERP");
    expect(availableLoginChannelsFromCapabilities(spaCaps).map((c) => c.label)).toEqual([
      "Centrix ERP",
    ]);
  });

  it("keeps retail channel labels", () => {
    expect(loginChannelLabel("backoffice", retailCaps)).toBe("Backoffice");
    expect(loginChannelLabel("manager", retailCaps)).toBe("Manager app");
    expect(formatLoginChannels(["backoffice", "pos"], retailCaps)).toBe(
      "Backoffice, POS (external terminal)",
    );
  });
});
