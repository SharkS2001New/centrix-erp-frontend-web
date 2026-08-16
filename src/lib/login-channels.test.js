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
    admin: true,
  },
  allowed_login_channels: ["backoffice", "manager"],
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
  it("labels hotel channels as Centrix ERP and Managers App", () => {
    expect(loginChannelLabel("backoffice", hotelCaps)).toBe("Centrix ERP");
    expect(loginChannelLabel("manager", hotelCaps)).toBe("Managers App");
    expect(formatLoginChannels(["backoffice", "manager"], hotelCaps)).toBe(
      "Centrix ERP, Managers App",
    );
    expect(availableLoginChannelsFromCapabilities(hotelCaps).map((c) => c.label)).toEqual([
      "Centrix ERP",
      "Managers App",
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
