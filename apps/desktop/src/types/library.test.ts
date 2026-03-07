// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getRegionalSystemName } from "./library";

describe("getRegionalSystemName", () => {
  it("returns Famicom for NES in Japan", () => {
    expect(getRegionalSystemName("nes", "jp")).toBe("Famicom");
  });

  it("returns NES for NES in US", () => {
    expect(getRegionalSystemName("nes", "us")).toBe("NES");
  });

  it("returns Super Famicom for SNES in Japan", () => {
    expect(getRegionalSystemName("snes", "jp")).toBe("Super Famicom");
  });

  it("returns SNES for SNES in US", () => {
    expect(getRegionalSystemName("snes", "us")).toBe("SNES");
  });

  it("returns Mega Drive for Genesis in Europe", () => {
    expect(getRegionalSystemName("genesis", "eu")).toBe("Mega Drive");
  });

  it("returns Mega Drive for Genesis in Japan", () => {
    expect(getRegionalSystemName("genesis", "jp")).toBe("Mega Drive");
  });

  it("returns Genesis for Genesis in US", () => {
    expect(getRegionalSystemName("genesis", "us")).toBe("Genesis");
  });

  it("returns undefined for systems without regional variants", () => {
    expect(getRegionalSystemName("gb", "jp")).toBeUndefined();
    expect(getRegionalSystemName("gba", "us")).toBeUndefined();
    expect(getRegionalSystemName("n64", "eu")).toBeUndefined();
    expect(getRegionalSystemName("psx", "jp")).toBeUndefined();
  });

  it("returns undefined when region is undefined", () => {
    expect(getRegionalSystemName("nes", undefined)).toBeUndefined();
    expect(getRegionalSystemName("snes", undefined)).toBeUndefined();
  });

  it("returns undefined for unknown region codes", () => {
    expect(getRegionalSystemName("nes", "xx")).toBeUndefined();
    expect(getRegionalSystemName("genesis", "br")).toBeUndefined();
  });

  it("returns undefined for unknown system IDs", () => {
    expect(getRegionalSystemName("dreamcast", "jp")).toBeUndefined();
  });
});
