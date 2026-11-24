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
  it("labels hotel channels as CentrixERP, CentrixAsMobile, and Managers App", () => {
    expect(loginChannelLabel("backoffice", hotelCaps)).toBe("CentrixERP");
    expect(loginChannelLabel("centrix_as_mobile", hotelCaps)).toBe("CentrixAsMobile");
    expect(loginChannelLabel("manager", hotelCaps)).toBe("Managers App");
    expect(formatLoginChannels(["backoffice", "centrix_as_mobile", "manager"], hotelCaps)).toBe(
      "CentrixERP, CentrixAsMobile, Managers App",
    );
    expect(availableLoginChannelsFromCapabilities(hotelCaps).map((c) => c.label)).toEqual([
      "CentrixERP",
      "CentrixAsMobile",
      "CentrixFieldSales",
      "Managers App",
    ]);
  });

  it("labels SPA & Kinyozi web sign-in as CentrixERP", () => {
    const spaCaps = {
      industry: "spa",
      deployment_profile: "spa_kinyozi",
      modules: { spa: true, admin: true },
      allowed_login_channels: ["backoffice"],
    };
    expect(loginChannelLabel("backoffice", spaCaps)).toBe("CentrixERP");
    expect(availableLoginChannelsFromCapabilities(spaCaps).map((c) => c.label)).toEqual([
      "CentrixERP",
    ]);
  });

  it("labels Driving School channels as CentrixDriving and CentrixManagersApp", () => {
    const drivingCaps = {
      industry: "driving",
      deployment_profile: "driving_school",
      modules: { driving: true, admin: true },
      allowed_login_channels: ["backoffice", "manager"],
    };
    expect(loginChannelLabel("backoffice", drivingCaps)).toBe("CentrixDriving");
    expect(loginChannelLabel("manager", drivingCaps)).toBe("CentrixManagersApp");
    expect(formatLoginChannels(["backoffice", "manager"], drivingCaps)).toBe(
      "CentrixDriving, CentrixManagersApp",
    );
    expect(availableLoginChannelsFromCapabilities(drivingCaps).map((c) => c.label)).toEqual([
      "CentrixDriving",
      "CentrixManagersApp",
    ]);
  });

  it("labels ERP sign-in as CentrixERP", () => {
    expect(loginChannelLabel("backoffice", retailCaps)).toBe("CentrixERP");
    expect(loginChannelLabel("manager", retailCaps)).toBe("Manager app");
    expect(formatLoginChannels(["backoffice", "pos"], retailCaps)).toBe(
      "CentrixERP, POS (external terminal)",
    );
  });
});
