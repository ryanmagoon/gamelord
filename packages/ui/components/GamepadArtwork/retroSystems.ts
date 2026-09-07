import type { ControllerMapping } from "../ControllerConfig/controller-mappings";

export type RetroSystemId =
  | "nes"
  | "snes"
  | "genesis"
  | "gb"
  | "gbc"
  | "gba"
  | "n64"
  | "psx"
  | "psp"
  | "nds"
  | "saturn"
  | "gamecube"
  | "arcade";

export interface RetroControl {
  id: number;
  label: string;
}

export interface RetroSystem {
  id: RetroSystemId;
  name: string;
  hardware: string;
  controls: Array<RetroControl>;
  sticks: Array<string>;
}

const buttons = (...entries: Array<[number, string]>): Array<RetroControl> =>
  entries.map(([id, label]) => ({ id, label }));
const dpad = buttons([4, "Up"], [5, "Down"], [6, "Left"], [7, "Right"]);
const startSelect = buttons([2, "Select"], [3, "Start"]);
const ab = buttons([0, "B"], [8, "A"]);
const snesFace = buttons([0, "B"], [8, "A"], [1, "Y"], [9, "X"]);
const shoulders = buttons([10, "L"], [11, "R"]);
const psFace = buttons([0, "Cross"], [8, "Circle"], [1, "Square"], [9, "Triangle"]);

/** Labels and inputs follow the bundled libretro cores, not the USB controller family. */
export const RETRO_SYSTEMS: Array<RetroSystem> = [
  {
    id: "nes",
    name: "NES / Famicom",
    hardware: "NES Controller · NES-004",
    controls: [...dpad, ...ab, ...startSelect],
    sticks: [],
  },
  {
    id: "snes",
    name: "SNES / Super Famicom",
    hardware: "Super Nintendo Controller · SNS-005",
    controls: [...dpad, ...snesFace, ...shoulders, ...startSelect],
    sticks: [],
  },
  {
    id: "genesis",
    name: "Sega Genesis / Mega Drive",
    hardware: "Genesis 6-Button Control Pad",
    controls: [
      ...dpad,
      ...buttons(
        [1, "A"],
        [0, "B"],
        [8, "C"],
        [10, "X"],
        [9, "Y"],
        [11, "Z"],
        [2, "Mode"],
        [3, "Start"],
      ),
    ],
    sticks: [],
  },
  {
    id: "gb",
    name: "Game Boy",
    hardware: "Game Boy · DMG-01",
    controls: [...dpad, ...ab, ...startSelect],
    sticks: [],
  },
  {
    id: "gbc",
    name: "Game Boy Color",
    hardware: "Game Boy Color · CGB-001",
    controls: [...dpad, ...ab, ...startSelect],
    sticks: [],
  },
  {
    id: "gba",
    name: "Game Boy Advance",
    hardware: "Game Boy Advance · AGB-001",
    controls: [...dpad, ...ab, ...shoulders, ...startSelect],
    sticks: [],
  },
  {
    id: "n64",
    name: "Nintendo 64",
    hardware: "Nintendo 64 Controller · NUS-005",
    controls: [
      ...dpad,
      ...buttons(
        [0, "A"],
        [1, "B"],
        [10, "L"],
        [11, "R"],
        [12, "Z"],
        [3, "Start"],
        [16, "C Up"],
        [17, "C Down"],
        [18, "C Left"],
        [19, "C Right"],
      ),
    ],
    sticks: ["Control Stick"],
  },
  {
    id: "psx",
    name: "PlayStation 1",
    hardware: "PlayStation DualShock · SCPH-1200",
    controls: [
      ...dpad,
      ...psFace,
      ...buttons([10, "L1"], [11, "R1"], [12, "L2"], [13, "R2"], [14, "L3"], [15, "R3"]),
      ...startSelect,
    ],
    sticks: ["Left Stick", "Right Stick"],
  },
  {
    id: "psp",
    name: "PSP",
    hardware: "PlayStation Portable · PSP-1000",
    controls: [...dpad, ...psFace, ...shoulders, ...startSelect],
    sticks: ["Analog Stick"],
  },
  {
    id: "nds",
    name: "Nintendo DS",
    hardware: "Nintendo DS · NTR-001",
    controls: [...dpad, ...snesFace, ...shoulders, ...startSelect],
    sticks: [],
  },
  {
    id: "saturn",
    name: "Sega Saturn",
    hardware: "Sega Saturn Control Pad · Model 2",
    controls: [
      ...dpad,
      ...buttons(
        [0, "A"],
        [8, "B"],
        [11, "C"],
        [1, "X"],
        [9, "Y"],
        [10, "Z"],
        [12, "L"],
        [13, "R"],
        [3, "Start"],
      ),
    ],
    sticks: [],
  },
  {
    id: "gamecube",
    name: "GameCube",
    hardware: "Nintendo GameCube Controller · DOL-003",
    controls: [
      ...dpad,
      ...snesFace,
      ...buttons(
        [12, "L"],
        [13, "R"],
        [11, "Z"],
        [14, "L Half Press"],
        [15, "R Half Press"],
        [3, "Start / Pause"],
      ),
    ],
    sticks: ["Control Stick", "C Stick"],
  },
  {
    id: "arcade",
    name: "Arcade",
    hardware: "6-button arcade panel",
    controls: [
      ...dpad,
      ...buttons(
        [0, "Button 1"],
        [8, "Button 2"],
        [1, "Button 3"],
        [9, "Button 4"],
        [10, "Button 5"],
        [11, "Button 6"],
        [2, "Coin"],
        [3, "Start"],
      ),
    ],
    sticks: [],
  },
];

export function retroSystem(id: RetroSystemId): RetroSystem {
  return RETRO_SYSTEMS.find((system) => system.id === id)!;
}

/** Translate physical inputs through the saved bindings before posing target hardware. */
export function mappedRetroInput(
  mapping: ControllerMapping,
  states: Record<number, boolean>,
  values: Record<number, number>,
  axes: Array<number>,
  systemId?: RetroSystemId,
) {
  const buttonStates: Record<number, boolean> = {};
  const buttonValues: Record<number, number> = {};
  for (const binding of mapping.bindings) {
    const index = binding.gamepadButtonIndex;
    if (index !== null) {
      buttonStates[binding.retroId] = Boolean(states[index]);
      buttonValues[binding.retroId] = values[index] ?? (states[index] ? 1 : 0);
    }
  }
  // Matches gameplay's left-stick-to-D-pad contribution without overriding a held button.
  for (const [id, value] of [
    [6, -(axes[0] ?? 0)],
    [7, axes[0] ?? 0],
    [4, -(axes[1] ?? 0)],
    [5, axes[1] ?? 0],
  ]) {
    if (value > 0.5) {
      buttonStates[id] = true;
      buttonValues[id] = 1;
    }
  }
  const axisValues = axes.slice();
  if (systemId === "gamecube") {
    buttonValues[12] = Math.max(buttonValues[12] ?? 0, buttonStates[14] ? 0.5 : 0);
    buttonValues[13] = Math.max(buttonValues[13] ?? 0, buttonStates[15] ? 0.5 : 0);
  }
  if (systemId === "n64") {
    axisValues[2] = Math.max(
      -1,
      Math.min(
        1,
        (axes[2] ?? 0) + Number(Boolean(buttonStates[19])) - Number(Boolean(buttonStates[18])),
      ),
    );
    axisValues[3] = Math.max(
      -1,
      Math.min(
        1,
        (axes[3] ?? 0) + Number(Boolean(buttonStates[17])) - Number(Boolean(buttonStates[16])),
      ),
    );
    // Mupen64Plus defaults: alt-map=False and C1/C2/C3/C4 = A/Y/B/X.
    // R2 switches the face buttons to C controls and suppresses native A/B.
    const cMode = Boolean(buttonStates[13]);
    const cFaces: Record<number, boolean> = {
      16: cMode && Boolean(buttonStates[9]),
      17: cMode && Boolean(buttonStates[0]),
      18: cMode && Boolean(buttonStates[1]),
      19: cMode && Boolean(buttonStates[8]),
    };
    if (cMode) {
      buttonStates[0] = false;
      buttonStates[1] = false;
      buttonValues[0] = 0;
      buttonValues[1] = 0;
    }
    // Gameplay sends rounded int16 axes. The core ORs stick input with C faces
    // only when its magnitude strictly exceeds CSTICK_DEADZONE (0x4000).
    const cX = Math.round(axisValues[2] * 32_767);
    const cY = Math.round(axisValues[3] * 32_767);
    for (const [id, value] of [
      [16, -cY],
      [17, cY],
      [18, -cX],
      [19, cX],
    ]) {
      buttonStates[id] = cFaces[id] || value > 0x40_00;
      buttonValues[id] = Number(buttonStates[id]);
    }
  }
  return { buttonStates, buttonValues, axisValues };
}
