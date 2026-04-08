import { describe, it, expect } from "vitest";
import {
  parseChtFile,
  matchChtFilename,
  baseTitle,
  parseDuckStationChtFile,
  formatSerial,
  isBeetleCompatible,
  parseGgBinary,
  ggToGameShark,
} from "./CheatDatabaseService";

describe("parseChtFile", () => {
  it("parses a standard .cht file with multiple cheats", () => {
    const content = `cheats = 3

cheat0_desc = "Infinite Lives"
cheat0_code = "APEETPEY"
cheat0_enable = false

cheat1_desc = "Start With 9 Lives"
cheat1_code = "092-17F"
cheat1_enable = false

cheat2_desc = "Moon Jump"
cheat2_code = "DDA7-136A+DDA9-12DA"
cheat2_enable = true
`;
    const cheats = parseChtFile(content);

    expect(cheats).toHaveLength(3);
    expect(cheats[0]).toEqual({
      index: 0,
      description: "Infinite Lives",
      code: "APEETPEY",
      enabled: false,
    });
    expect(cheats[1]).toEqual({
      index: 1,
      description: "Start With 9 Lives",
      code: "092-17F",
      enabled: false,
    });
    expect(cheats[2]).toEqual({
      index: 2,
      description: "Moon Jump",
      code: "DDA7-136A+DDA9-12DA",
      enabled: true,
    });
  });

  it("handles quoted values with escaped quotes", () => {
    const content = `cheats = 1

cheat0_desc = "Player 1 \\"Infinite\\" Health"
cheat0_code = "7E0F28:FF"
cheat0_enable = false
`;
    const cheats = parseChtFile(content);

    expect(cheats).toHaveLength(1);
    expect(cheats[0]?.description).toBe('Player 1 "Infinite" Health');
  });

  it("handles values without quotes", () => {
    const content = `cheats = 1

cheat0_desc = Infinite Lives
cheat0_code = APEETPEY
cheat0_enable = false
`;
    const cheats = parseChtFile(content);

    expect(cheats).toHaveLength(1);
    expect(cheats[0]?.description).toBe("Infinite Lives");
    expect(cheats[0]?.code).toBe("APEETPEY");
  });

  it("returns empty array for empty file", () => {
    expect(parseChtFile("")).toEqual([]);
  });

  it("returns empty array when cheats = 0", () => {
    expect(parseChtFile("cheats = 0")).toEqual([]);
  });

  it("skips cheats with missing code", () => {
    const content = `cheats = 2

cheat0_desc = "Has Code"
cheat0_code = "APEETPEY"
cheat0_enable = false

cheat1_desc = "Missing Code"
cheat1_enable = false
`;
    const cheats = parseChtFile(content);

    expect(cheats).toHaveLength(1);
    expect(cheats[0]?.description).toBe("Has Code");
  });

  it("uses index as description when desc is missing", () => {
    const content = `cheats = 1

cheat0_code = "APEETPEY"
cheat0_enable = false
`;
    const cheats = parseChtFile(content);

    expect(cheats).toHaveLength(1);
    expect(cheats[0]?.description).toBe("Cheat 0");
  });

  it("defaults enabled to false when enable line is missing", () => {
    const content = `cheats = 1

cheat0_desc = "Test"
cheat0_code = "ABC123"
`;
    const cheats = parseChtFile(content);

    expect(cheats).toHaveLength(1);
    expect(cheats[0]?.enabled).toBe(false);
  });

  it("handles Windows-style line endings", () => {
    const content =
      'cheats = 1\r\ncheat0_desc = "Test"\r\ncheat0_code = "ABC"\r\ncheat0_enable = false\r\n';
    const cheats = parseChtFile(content);

    expect(cheats).toHaveLength(1);
    expect(cheats[0]?.code).toBe("ABC");
  });
});

describe("matchChtFilename", () => {
  it("matches exact ROM filename (no extension)", () => {
    expect(matchChtFilename("Super Mario Bros. (USA)", "Super Mario Bros. (USA).cht")).toBe(true);
  });

  it("rejects non-matching filename", () => {
    expect(matchChtFilename("Super Mario Bros. (USA)", "Zelda (USA).cht")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(matchChtFilename("super mario bros", "Super Mario Bros.cht")).toBe(true);
  });

  it("matches against .cht extension only", () => {
    expect(matchChtFilename("Game", "Game.cht")).toBe(true);
    expect(matchChtFilename("Game", "Game.txt")).toBe(false);
  });

  it("matches when ROM has fewer parenthetical groups than cht file", () => {
    expect(
      matchChtFilename(
        "Resident Evil - Director's Cut (USA)",
        "Resident Evil - Director's Cut (USA, Europe) (Game Buster).cht",
      ),
    ).toBe(true);
  });

  it("matches when both have different region tags", () => {
    expect(
      matchChtFilename(
        "Resident Evil - Survivor (USA)",
        "Resident Evil - Survivor (USA, Europe) (GameShark).cht",
      ),
    ).toBe(true);
  });

  it("rejects different base titles despite similar parentheticals", () => {
    expect(matchChtFilename("Resident Evil 2 (USA)", "Resident Evil 3 - Nemesis (USA).cht")).toBe(
      false,
    );
  });

  it("matches when ROM has no parenthetical groups at all", () => {
    expect(
      matchChtFilename(
        "Resident Evil - Director's Cut",
        "Resident Evil - Director's Cut (USA, Europe) (Game Buster).cht",
      ),
    ).toBe(true);
  });
});

describe("baseTitle", () => {
  it("strips parenthetical groups and normalises whitespace", () => {
    expect(baseTitle("Resident Evil - Director's Cut (USA, Europe) (Game Buster)")).toBe(
      "resident evil - director's cut",
    );
  });

  it("handles names with no parenthetical groups", () => {
    expect(baseTitle("Super Mario Bros")).toBe("super mario bros");
  });

  it("handles names that are all parenthetical groups", () => {
    expect(baseTitle("(USA) (GameShark)")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// DuckStation chtdb parser
// ---------------------------------------------------------------------------

describe("parseDuckStationChtFile", () => {
  it("parses a standard DuckStation .cht file", () => {
    const content = `; CHTDB: ; [ Resident Evil (USA) (1996) (Capcom) {SLUS-00170} <revil> ]

[Infinite Health Chris]
Type = Gameshark
Activation = EndFrame
800C51AC 008C

[Infinite Health Jill]
Type = Gameshark
Activation = EndFrame
800C51AC 008C
`;
    const cheats = parseDuckStationChtFile(content);

    expect(cheats).toHaveLength(2);
    expect(cheats[0]).toEqual({
      index: 0,
      description: "Infinite Health Chris",
      code: "800C51AC 008C",
      enabled: false,
    });
    expect(cheats[1]).toEqual({
      index: 1,
      description: "Infinite Health Jill",
      code: "800C51AC 008C",
      enabled: false,
    });
  });

  it("joins multi-line codes with +", () => {
    const content = `[Triangle Button Restores Health]
Type = Gameshark
Activation = EndFrame
D00CF844 0010
800C51AC 00C8
`;
    const cheats = parseDuckStationChtFile(content);

    expect(cheats).toHaveLength(1);
    expect(cheats[0]?.code).toBe("D00CF844 0010+800C51AC 00C8");
  });

  it("skips comment-only lines and blank lines", () => {
    const content = `; This is a comment
; Another comment

[Only Cheat]
Type = Gameshark
Activation = EndFrame
800C51AC 008C
`;
    const cheats = parseDuckStationChtFile(content);

    expect(cheats).toHaveLength(1);
    expect(cheats[0]?.description).toBe("Only Cheat");
  });

  it("returns empty array for empty file", () => {
    expect(parseDuckStationChtFile("")).toEqual([]);
  });

  it("returns empty array for comment-only file", () => {
    expect(parseDuckStationChtFile("; just a comment\n; another")).toEqual([]);
  });

  it("handles Windows-style line endings", () => {
    const content =
      "[Test Cheat]\r\nType = Gameshark\r\nActivation = EndFrame\r\n800C51AC 008C\r\n";
    const cheats = parseDuckStationChtFile(content);

    expect(cheats).toHaveLength(1);
    expect(cheats[0]?.code).toBe("800C51AC 008C");
  });

  it("handles cheats without Type/Activation metadata", () => {
    const content = `[Bare Cheat]
800C51AC 008C
`;
    const cheats = parseDuckStationChtFile(content);

    expect(cheats).toHaveLength(1);
    expect(cheats[0]?.code).toBe("800C51AC 008C");
  });

  it("skips sections with no code lines", () => {
    const content = `[Empty Section]
Type = Gameshark
Activation = EndFrame

[Has Code]
Type = Gameshark
Activation = EndFrame
800C51AC 008C
`;
    const cheats = parseDuckStationChtFile(content);

    expect(cheats).toHaveLength(1);
    expect(cheats[0]?.description).toBe("Has Code");
  });

  it("handles multiple complex multi-line codes", () => {
    const content = `[L1 + X Button For Save Anywhere]
Type = Gameshark
Activation = EndFrame
D00CF844 0044
800C8456 0002
800343F2 2400
8003446E 2400

[Simple Code]
Type = Gameshark
Activation = EndFrame
800C867C 0000
`;
    const cheats = parseDuckStationChtFile(content);

    expect(cheats).toHaveLength(2);
    expect(cheats[0]?.code).toBe("D00CF844 0044+800C8456 0002+800343F2 2400+8003446E 2400");
    expect(cheats[1]?.code).toBe("800C867C 0000");
  });
});

// ---------------------------------------------------------------------------
// formatSerial
// ---------------------------------------------------------------------------

describe("formatSerial", () => {
  it("formats raw serial from core log into chtdb filename format", () => {
    expect(formatSerial("SLUS00551")).toBe("SLUS-00551");
  });

  it("returns already-formatted serial unchanged", () => {
    expect(formatSerial("SLUS-00551")).toBe("SLUS-00551");
  });

  it("handles SCES prefix", () => {
    expect(formatSerial("SCES00001")).toBe("SCES-00001");
  });

  it("handles SCPS prefix", () => {
    expect(formatSerial("SCPS10001")).toBe("SCPS-10001");
  });

  it("returns non-matching strings as-is", () => {
    expect(formatSerial("SOMETHING_ELSE")).toBe("SOMETHING_ELSE");
  });

  it("handles uppercase with existing hyphen", () => {
    expect(formatSerial("slus-00551")).toBe("SLUS-00551");
  });
});

// ---------------------------------------------------------------------------
// isBeetleCompatible
// ---------------------------------------------------------------------------

describe("isBeetleCompatible", () => {
  it("accepts standard 16-bit constant write (80 prefix)", () => {
    expect(isBeetleCompatible("800C51AC 008C")).toBe(true);
  });

  it("accepts standard 8-bit constant write (30 prefix)", () => {
    expect(isBeetleCompatible("300C8714 003F")).toBe(true);
  });

  it("accepts conditional code (D0 prefix)", () => {
    expect(isBeetleCompatible("D00CF844 0010")).toBe(true);
  });

  it("accepts 8-bit conditional (E0 prefix)", () => {
    expect(isBeetleCompatible("E00CF845 0040")).toBe(true);
  });

  it("accepts multi-line standard codes joined with +", () => {
    expect(isBeetleCompatible("D00CF844 0010+800C51AC 00C8")).toBe(true);
  });

  it("accepts 50 repeat codes with standard value length", () => {
    expect(isBeetleCompatible("50000902 0001+800C8724 FF02")).toBe(true);
  });

  it("rejects DuckStation A7 32-bit patch codes", () => {
    expect(isBeetleCompatible("A7038CCA 10402400")).toBe(false);
  });

  it("rejects DuckStation F4 advanced conditional", () => {
    expect(isBeetleCompatible("F4105000 00FF5000")).toBe(false);
  });

  it("rejects 90 32-bit write codes", () => {
    expect(isBeetleCompatible("9000BF90 27BDFFD8")).toBe(false);
  });

  it("rejects mixed: one standard + one extended", () => {
    expect(isBeetleCompatible("800C51AC 008C+A7038CCA 10402400")).toBe(false);
  });

  it("rejects codes with non-standard value lengths", () => {
    // 2F/FFFF patterns from extended DuckStation format
    expect(isBeetleCompatible("2F004010 00000000")).toBe(false);
    expect(isBeetleCompatible("FFFFFFFF FFFFFFFF")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MiSTer .gg binary parser
// ---------------------------------------------------------------------------

/**
 * Helper to build a .gg binary buffer from structured entries.
 * Each entry is 16 bytes: compareFlag(u32LE), address(u32LE),
 * compareValue(u32LE), replaceValue(u32LE).
 */
function buildGgBuffer(
  entries: Array<{
    compareFlag: number;
    address: number;
    compareValue: number;
    replaceValue: number;
  }>,
): Buffer {
  const buf = Buffer.alloc(entries.length * 16);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    buf.writeUInt32LE(entry.compareFlag, i * 16);
    buf.writeUInt32LE(entry.address, i * 16 + 4);
    buf.writeUInt32LE(entry.compareValue, i * 16 + 8);
    buf.writeUInt32LE(entry.replaceValue, i * 16 + 12);
  }
  return buf;
}

describe("parseGgBinary", () => {
  it("returns empty array for empty buffer", () => {
    expect(parseGgBinary(Buffer.alloc(0))).toEqual([]);
  });

  it("parses a single 16-byte entry without compare", () => {
    const buf = buildGgBuffer([
      { compareFlag: 0, address: 0x0c_51_ac, compareValue: 0, replaceValue: 0x00_8c },
    ]);
    const codes = parseGgBinary(buf);

    expect(codes).toHaveLength(1);
    expect(codes[0]).toEqual({
      compareFlag: 0,
      address: 0x0c_51_ac,
      compareValue: 0,
      replaceValue: 0x00_8c,
    });
  });

  it("parses a single entry with compare flag set", () => {
    const buf = buildGgBuffer([
      { compareFlag: 1, address: 0xff_1c_a0, compareValue: 0xb5, replaceValue: 0xff },
    ]);
    const codes = parseGgBinary(buf);

    expect(codes).toHaveLength(1);
    expect(codes[0]).toEqual({
      compareFlag: 1,
      address: 0xff_1c_a0,
      compareValue: 0xb5,
      replaceValue: 0xff,
    });
  });

  it("parses multiple entries (32 bytes = 2 codes)", () => {
    const buf = buildGgBuffer([
      { compareFlag: 0, address: 0x0c_51_ac, compareValue: 0, replaceValue: 0x00_8c },
      { compareFlag: 1, address: 0x0c_f8_44, compareValue: 0x00_10, replaceValue: 0x00_c8 },
    ]);
    const codes = parseGgBinary(buf);

    expect(codes).toHaveLength(2);
    expect(codes[0]!.compareFlag).toBe(0);
    expect(codes[1]!.compareFlag).toBe(1);
  });

  it("ignores trailing bytes that don't form a complete 16-byte entry", () => {
    // 20 bytes = 1 full entry + 4 leftover bytes
    const full = buildGgBuffer([
      { compareFlag: 0, address: 0x0c_51_ac, compareValue: 0, replaceValue: 0x00_8c },
    ]);
    const buf = Buffer.concat([full, Buffer.from([0xde, 0xad, 0xbe, 0xef])]);

    const codes = parseGgBinary(buf);
    expect(codes).toHaveLength(1);
  });

  it("returns empty array for buffer smaller than 16 bytes", () => {
    expect(parseGgBinary(Buffer.alloc(15))).toEqual([]);
  });

  it("handles addresses with PSX RAM base (0x80_00_00_00)", () => {
    const buf = buildGgBuffer([
      { compareFlag: 0, address: 0x80_0c_51_ac, compareValue: 0, replaceValue: 0x00_8c },
    ]);
    const codes = parseGgBinary(buf);

    expect(codes).toHaveLength(1);
    expect(codes[0]!.address).toBe(0x80_0c_51_ac);
  });
});

// ---------------------------------------------------------------------------
// .gg → GameShark conversion
// ---------------------------------------------------------------------------

describe("ggToGameShark", () => {
  it("converts a 16-bit write (no compare, value > 0xFF)", () => {
    const result = ggToGameShark({
      compareFlag: 0,
      address: 0x0c_51_ac,
      compareValue: 0,
      replaceValue: 0x00_8c,
    });
    // 16-bit write: 80 prefix + 24-bit address + 4-hex value
    expect(result).toBe("800C51AC 008C");
  });

  it("uses 16-bit write even for small values (format is not recoverable from .gg)", () => {
    const result = ggToGameShark({
      compareFlag: 0,
      address: 0x0c_87_14,
      compareValue: 0,
      replaceValue: 0x3f,
    });
    // Always 80 prefix — the .gg format doesn't encode 8-bit vs 16-bit
    expect(result).toBe("800C8714 003F");
  });

  it("converts a conditional write (compare flag set)", () => {
    const result = ggToGameShark({
      compareFlag: 1,
      address: 0x0c_f8_44,
      compareValue: 0x00_10,
      replaceValue: 0x00_c8,
    });
    // Conditional: D0 compare line + 80 write line
    expect(result).toBe("D00CF844 0010+800CF844 00C8");
  });

  it("masks off PSX RAM base address (0x80_00_00_00)", () => {
    const result = ggToGameShark({
      compareFlag: 0,
      address: 0x80_0c_51_ac,
      compareValue: 0,
      replaceValue: 0x00_8c,
    });
    expect(result).toBe("800C51AC 008C");
  });

  it("handles address without PSX base correctly", () => {
    const result = ggToGameShark({
      compareFlag: 0,
      address: 0x00_12_34,
      compareValue: 0,
      replaceValue: 0xab,
    });
    expect(result).toBe("80001234 00AB");
  });

  it("produces output that passes isBeetleCompatible for simple writes", () => {
    const result = ggToGameShark({
      compareFlag: 0,
      address: 0x0c_51_ac,
      compareValue: 0,
      replaceValue: 0x00_8c,
    });
    expect(isBeetleCompatible(result)).toBe(true);
  });

  it("produces output where each line passes isBeetleCompatible for conditional writes", () => {
    const result = ggToGameShark({
      compareFlag: 1,
      address: 0x0c_f8_44,
      compareValue: 0x00_10,
      replaceValue: 0x00_c8,
    });
    expect(isBeetleCompatible(result)).toBe(true);
  });

  it("zero-pads small values in 16-bit write format", () => {
    const result = ggToGameShark({
      compareFlag: 0,
      address: 0x0c_87_14,
      compareValue: 0,
      replaceValue: 0,
    });
    expect(result).toBe("800C8714 0000");
  });

  it("handles max single-byte value as 16-bit write", () => {
    const result = ggToGameShark({
      compareFlag: 0,
      address: 0x0c_87_14,
      compareValue: 0,
      replaceValue: 0xff,
    });
    expect(result).toBe("800C8714 00FF");
  });

  it("handles multi-byte value as 16-bit write", () => {
    const result = ggToGameShark({
      compareFlag: 0,
      address: 0x0c_87_14,
      compareValue: 0,
      replaceValue: 0x01_00,
    });
    expect(result).toBe("800C8714 0100");
  });
});
