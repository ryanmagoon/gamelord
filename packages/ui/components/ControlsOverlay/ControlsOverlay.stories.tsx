import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ControlsOverlay } from "./ControlsOverlay";
import type { KeyboardBinding } from "./controller-layouts";

/** Default bindings matching the actual KEY_MAP from GameWindow. */
const DEFAULT_BINDINGS: ReadonlyArray<KeyboardBinding> = [
  { key: "ArrowUp", label: "D-Pad Up" },
  { key: "ArrowDown", label: "D-Pad Down" },
  { key: "ArrowLeft", label: "D-Pad Left" },
  { key: "ArrowRight", label: "D-Pad Right" },
  { key: "z", label: "A" },
  { key: "x", label: "B" },
  { key: "a", label: "X" },
  { key: "s", label: "Y" },
  { key: "q", label: "L" },
  { key: "w", label: "R" },
  { key: "Shift", label: "Select" },
  { key: "Enter", label: "Start" },
];

/** Minimal bindings (e.g. a system that only uses a few buttons). */
const MINIMAL_BINDINGS: ReadonlyArray<KeyboardBinding> = [
  { key: "ArrowUp", label: "D-Pad Up" },
  { key: "ArrowDown", label: "D-Pad Down" },
  { key: "ArrowLeft", label: "D-Pad Left" },
  { key: "ArrowRight", label: "D-Pad Right" },
  { key: "z", label: "A" },
  { key: "x", label: "B" },
  { key: "Enter", label: "Start" },
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
    bindings: DEFAULT_BINDINGS,
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

export const Open: Story = {};

export const Closed: Story = {
  args: {
    open: false,
  },
};

export const MinimalBindings: Story = {
  args: { bindings: MINIMAL_BINDINGS },
};

export const NoBindings: Story = {
  args: { bindings: [] },
};
