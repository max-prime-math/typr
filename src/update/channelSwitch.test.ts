import { describe, expect, it } from "vitest";
import {
  getChannelDestination,
  getTyprChannelOption,
  isInstalledPwa,
  isTyprChannelOrigin
} from "./channelSwitch";

describe("Typr release channels", () => {
  it("maps product-facing channel names to their hosted origins", () => {
    expect(getChannelDestination("stable")).toBe("https://typr.ca/");
    expect(getChannelDestination("beta")).toBe("https://beta.typr.ca/");
    expect(getChannelDestination("development")).toBe("https://dev.typr.ca/");
    expect(getTyprChannelOption("development").shortLabel).toBe("dev");
  });

  it("only trusts the three exact hosted channel origins", () => {
    expect(isTyprChannelOrigin("https://typr.ca")).toBe(true);
    expect(isTyprChannelOrigin("https://beta.typr.ca")).toBe(true);
    expect(isTyprChannelOrigin("https://dev.typr.ca")).toBe(true);
    expect(isTyprChannelOrigin("https://dev.typr.ca.example.com")).toBe(false);
  });

  it("detects standalone display mode and the iOS standalone flag", () => {
    const standaloneDisplay = {
      matchMedia: () => ({ matches: true }),
      navigator: {}
    } as unknown as Window;
    const iosStandalone = {
      matchMedia: () => ({ matches: false }),
      navigator: { standalone: true }
    } as unknown as Window;
    const browser = {
      matchMedia: () => ({ matches: false }),
      navigator: {}
    } as unknown as Window;

    expect(isInstalledPwa(standaloneDisplay)).toBe(true);
    expect(isInstalledPwa(iosStandalone)).toBe(true);
    expect(isInstalledPwa(browser)).toBe(false);
  });
});
