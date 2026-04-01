import { describe, it, expect } from "vitest";
import {
  parseChtFile,
  matchChtFilename,
  baseTitle,
  parseDuckStationChtFile,
  formatSerial,
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
