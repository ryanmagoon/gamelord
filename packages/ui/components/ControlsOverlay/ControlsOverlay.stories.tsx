import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ControlsOverlay } from "./ControlsOverlay";
import type { KeyboardBinding } from "./controller-layouts";
import { filterBindingsForSystem } from "./controller-layouts";

/**
 * All keyboard bindings with retroId — matches the actual KEY_MAP from GameWindow.
 * This is the unfiltered superset; stories filter per-system.
 */
const ALL_BINDINGS: ReadonlyArray<KeyboardBinding> = [
  { key: "ArrowUp", label: "D-Pad Up", retroId: 4 },
  { key: "ArrowDown", label: "D-Pad Down", retroId: 5 },
  { key: "ArrowLeft", label: "D-Pad Left", retroId: 6 },
  { key: "ArrowRight", label: "D-Pad Right", retroId: 7 },
  { key: "z", label: "A", retroId: 8 },
  { key: "x", label: "B", retroId: 0 },
  { key: "a", label: "X", retroId: 9 },
  { key: "s", label: "Y", retroId: 1 },
  { key: "q", label: "L", retroId: 10 },
  { key: "w", label: "R", retroId: 11 },
  { key: "Shift", label: "Select", retroId: 2 },
  { key: "Enter", label: "Start", retroId: 3 },
];

const meta: Meta<typeof ControlsOverlay> = {
  component: ControlsOverlay,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  title: "Components/ControlsOverlay",
  args: {
    onClose: fn(),
    open: true,
    bindings: ALL_BINDINGS,
  },
  decorators: [
    (Story) => (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100vh",
          background: "#111",
        }}
      >
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ControlsOverlay>;

/** SNES — all standard buttons. */
export const Open: Story = {};

export const Closed: Story = {
  args: {
    open: false,
  },
};

/** NES — D-pad, A, B, Select, Start (no X/Y/L/R). */
export const NES: Story = {
  args: { bindings: filterBindingsForSystem(ALL_BINDINGS, "nes") },
};

/** GBA — D-pad, A, B, L, R, Select, Start (no X/Y). */
export const GBA: Story = {
  args: { bindings: filterBindingsForSystem(ALL_BINDINGS, "gba") },
};

/** Genesis — D-pad, A, B, X(C), Start (no L/R, no Select, no Y). */
export const Genesis: Story = {
  args: { bindings: filterBindingsForSystem(ALL_BINDINGS, "genesis") },
};

/** N64 — D-pad, A, B, L, R, Start (no X/Y, no Select). */
export const N64: Story = {
  args: { bindings: filterBindingsForSystem(ALL_BINDINGS, "n64") },
};

/** PS1 — all standard buttons. */
export const PS1: Story = {
  args: { bindings: filterBindingsForSystem(ALL_BINDINGS, "psx") },
};

export const NoBindings: Story = {
  args: { bindings: [] },
};
