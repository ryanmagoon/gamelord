import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";
import { GamepadArtwork, GamepadSceneStatus } from "./GamepadArtwork";
const meta = {
  title: "Controllers/GamepadArtwork",
  component: GamepadArtwork,
  parameters: { layout: "centered" },
  play: async ({ canvasElement }) => {
    await waitFor(
      () => {
        expect(
          canvasElement.querySelector('[data-scene-status="ready"] canvas[data-settled="true"]'),
        ).not.toBeNull();
      },
      { timeout: 15_000 },
    );
    const surface = canvasElement.querySelector("canvas")!;
    const draws = surface.dataset.drawCount;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(surface.dataset.drawCount).toBe(draws);
  },
  decorators: [
    (Story) => (
      <div
        className="dark"
        style={{
          width: 660,
          padding: 40,
          borderRadius: 24,
          background: "#171b23",
          color: "#e9eef5",
        }}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GamepadArtwork>;
export default meta;
type Story = StoryObj<typeof meta>;
export const NES: Story = { args: { systemId: "nes" } };
export const SNES: Story = { args: { systemId: "snes" } };
export const Genesis: Story = { args: { systemId: "genesis" } };
export const GameBoy: Story = { args: { systemId: "gb" } };
export const GameBoyColor: Story = { args: { systemId: "gbc" } };
export const GameBoyAdvance: Story = { args: { systemId: "gba" } };
export const Nintendo64: Story = { args: { systemId: "n64" } };
export const PlayStation: Story = { args: { systemId: "psx" } };
export const PSP: Story = { args: { systemId: "psp" } };
export const NintendoDS: Story = { args: { systemId: "nds" } };
export const Saturn: Story = { args: { systemId: "saturn" } };
export const GameCube: Story = { args: { systemId: "gamecube" } };
export const Arcade: Story = { args: { systemId: "arcade" } };
export const LiveInput: Story = {
  args: {
    systemId: "psx",
    buttonStates: { 0: true, 12: true, 7: true },
    axisValues: [0.75, -0.5, -0.5, 0.5],
  },
};
export const Remapping: Story = { args: { systemId: "snes", highlightedButton: 8 } };
export const Small: Story = {
  args: { systemId: "psx" },
  decorators: [
    (Story) => (
      <div style={{ width: 240 }}>
        <Story />
      </div>
    ),
  ],
};

export const Loading: Story = {
  render: () => (
    <div style={{ height: 300 }}>
      <GamepadSceneStatus />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("Loading 3D controller");
  },
};
export const Unavailable: Story = {
  render: () => (
    <div style={{ height: 300 }}>
      <GamepadSceneStatus error />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("3D controller unavailable");
  },
};
export const AnalogTriggers: Story = {
  args: { systemId: "gamecube", buttonValues: { 12: 0.25, 13: 0.85 } },
};

export const ContextLost: Story = {
  args: { systemId: "snes" },
  play: async ({ canvasElement, canvas }) => {
    await waitFor(
      () => expect(canvasElement.querySelector('[data-scene-status="ready"]')).not.toBeNull(),
      { timeout: 15_000 },
    );
    const surface = canvasElement.querySelector("canvas")!;
    const context = surface.getContext("webgl2")!;
    context.getExtension("WEBGL_lose_context")!.loseContext();
    await waitFor(() =>
      expect(canvas.getByRole("status")).toHaveTextContent("3D controller unavailable"),
    );
    expect(canvasElement.querySelector("canvas")).toBeNull();
  },
};
