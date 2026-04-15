import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DiscSwapOverlay } from "./DiscSwapOverlay";
import type { DiscInfo } from "./DiscSwapOverlay";

const THREE_DISC_GAME: ReadonlyArray<DiscInfo> = [
  { index: 0, label: "Disc 1", status: "current" },
  { index: 1, label: "Disc 2", status: "available" },
  { index: 2, label: "Disc 3", status: "available" },
];

const INCOMPLETE_SET: ReadonlyArray<DiscInfo> = [
  { index: 0, label: "Disc 1", status: "current" },
  { index: 1, label: "Disc 2", status: "missing" },
  { index: 2, label: "Disc 3", status: "available" },
];

const meta: Meta<typeof DiscSwapOverlay> = {
  component: DiscSwapOverlay,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  title: "Components/DiscSwapOverlay",
  args: {
    open: true,
    onClose: fn(),
    onSwap: fn(),
    discs: THREE_DISC_GAME,
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
type Story = StoryObj<typeof DiscSwapOverlay>;

/** 3-disc game, currently on Disc 1. */
export const ThreeDiscGame: Story = {};

/** Incomplete set — Disc 2 is missing, no browse handler (legacy). */
export const MissingDiscNoBrowse: Story = {
  args: {
    discs: INCOMPLETE_SET,
  },
};

/** Incomplete set — Disc 2 is missing, browse available. */
export const MissingDiscWithBrowse: Story = {
  args: {
    discs: INCOMPLETE_SET,
    onBrowse: fn(),
  },
};

/** Browse in progress — loading indicator on the missing disc. */
export const BrowseInProgress: Story = {
  args: {
    discs: INCOMPLETE_SET,
    onBrowse: fn(),
    browsingIndex: 1,
  },
};

/** Swap in progress — loading indicator on the target disc. */
export const SwapInProgress: Story = {
  args: {
    swappingIndex: 1,
  },
};

/** Currently on Disc 2 (mid-game). */
export const OnDiscTwo: Story = {
  args: {
    discs: [
      { index: 0, label: "Disc 1", status: "available" },
      { index: 1, label: "Disc 2", status: "current" },
      { index: 2, label: "Disc 3", status: "available" },
    ],
  },
};

/** Four-disc game (e.g. Final Fantasy VIII). */
export const FourDiscGame: Story = {
  args: {
    discs: [
      { index: 0, label: "Disc 1", status: "current" },
      { index: 1, label: "Disc 2", status: "available" },
      { index: 2, label: "Disc 3", status: "available" },
      { index: 3, label: "Disc 4", status: "available" },
    ],
  },
};

export const Closed: Story = {
  args: {
    open: false,
  },
};
