import { describe, it, expect } from "vitest";
import {
  filterForwardableLogs,
  RETRO_LOG_DEBUG,
  RETRO_LOG_INFO,
  RETRO_LOG_WARN,
  RETRO_LOG_ERROR,
  MIN_FORWARD_LOG_LEVEL,
} from "./core-worker-protocol";

describe("filterForwardableLogs", () => {
  it("drops debug-level messages", () => {
    const entries = [
      { level: RETRO_LOG_DEBUG, message: "GBA DMA: Starting DMA 3 0x03006204 -> 0x0600F1C0" },
      { level: RETRO_LOG_DEBUG, message: "GBA DMA: Starting DMA 3 0x030068C4 -> 0x0600E1C0" },
    ];

    expect(filterForwardableLogs(entries)).toEqual([]);
  });

  it("keeps info, warn, and error messages", () => {
    const entries = [
      { level: RETRO_LOG_INFO, message: "Core loaded successfully" },
      { level: RETRO_LOG_WARN, message: "Save file not found" },
      { level: RETRO_LOG_ERROR, message: "Failed to open ROM" },
    ];

    const result = filterForwardableLogs(entries);
    expect(result).toHaveLength(3);
    expect(result).toEqual(entries);
  });

  it("filters a mixed batch, keeping only non-debug entries", () => {
    const entries = [
      { level: RETRO_LOG_DEBUG, message: "DMA trace 1" },
      { level: RETRO_LOG_INFO, message: "Loaded BIOS" },
      { level: RETRO_LOG_DEBUG, message: "DMA trace 2" },
      { level: RETRO_LOG_DEBUG, message: "DMA trace 3" },
      { level: RETRO_LOG_ERROR, message: "Audio buffer underrun" },
      { level: RETRO_LOG_DEBUG, message: "DMA trace 4" },
    ];

    const result = filterForwardableLogs(entries);
    expect(result).toEqual([
      { level: RETRO_LOG_INFO, message: "Loaded BIOS" },
      { level: RETRO_LOG_ERROR, message: "Audio buffer underrun" },
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(filterForwardableLogs([])).toEqual([]);
  });

  it("handles a high-volume debug flood (simulating real-world mGBA output)", () => {
    // Simulate what mGBA does: hundreds of debug messages per frame drain
    const entries = Array.from({ length: 500 }, (_, i) => ({
      level: RETRO_LOG_DEBUG,
      message: `GBA DMA: Starting DMA 3 0x${i.toString(16).padStart(8, "0")} -> 0x0600F1C0 (8000:001F)`,
    }));
    // Sprinkle in one real message
    entries.push({ level: RETRO_LOG_WARN, message: "Battery save loaded" });

    const result = filterForwardableLogs(entries);
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe("Battery save loaded");
  });

  it("minimum forward level is info (level 1)", () => {
    expect(MIN_FORWARD_LOG_LEVEL).toBe(1);
  });
});
