import { describe, it, expect } from "vitest";
import { parseChtFile, matchChtFilename } from "./CheatDatabaseService";

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
});
