import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ControlsOverlay } from "./ControlsOverlay";
import type { KeyboardBinding } from "./controller-layouts";
import { formatKeyLabel, isDPadBinding } from "./controller-layouts";

/** Standard bindings matching the actual KEY_MAP from GameWindow. */
const STANDARD_BINDINGS: ReadonlyArray<KeyboardBinding> = [
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

function renderOverlay(props: Partial<Parameters<typeof ControlsOverlay>[0]> = {}) {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    bindings: STANDARD_BINDINGS,
  };
  return { ...render(<ControlsOverlay {...defaultProps} {...props} />), ...defaultProps };
}

describe("ControlsOverlay", () => {
  describe("rendering", () => {
    it("renders nothing when closed", () => {
      const { container } = renderOverlay({ open: false });
      expect(container.querySelector("[role='dialog']")).toBeNull();
    });

    it("renders when open", () => {
      renderOverlay();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("renders D-pad cluster when d-pad bindings are provided", () => {
      const { container } = renderOverlay();
      expect(container.querySelector("[data-testid='dpad-cluster']")).not.toBeNull();
    });

    it("renders button bindings with labels", () => {
      const { container } = renderOverlay();
      // Check that binding test IDs are present for non-d-pad buttons
      expect(container.querySelector("[data-testid='binding-A']")).not.toBeNull();
      expect(container.querySelector("[data-testid='binding-B']")).not.toBeNull();
      expect(container.querySelector("[data-testid='binding-Start']")).not.toBeNull();
    });

    it("renders shortcuts section", () => {
      renderOverlay();
      expect(screen.getByText("Pause")).toBeInTheDocument();
      expect(screen.getByText("Fast-forward")).toBeInTheDocument();
      expect(screen.getByText("Save State")).toBeInTheDocument();
      expect(screen.getByText("Load State")).toBeInTheDocument();
    });

    it("has proper ARIA attributes", () => {
      renderOverlay();
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-label", "Keyboard Controls");
    });

    it("renders no d-pad when no d-pad bindings are provided", () => {
      const bindings: ReadonlyArray<KeyboardBinding> = [
        { key: "z", label: "A" },
        { key: "x", label: "B" },
      ];
      const { container } = renderOverlay({ bindings });
      expect(container.querySelector("[data-testid='dpad-cluster']")).toBeNull();
    });

    it("handles empty bindings gracefully", () => {
      renderOverlay({ bindings: [] });
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      // Shortcuts should still render
      expect(screen.getByText("Pause")).toBeInTheDocument();
    });
  });

  describe("interaction", () => {
    it("calls onClose when Escape is pressed", async () => {
      const user = userEvent.setup();
      const { onClose } = renderOverlay();

      await user.keyboard("{Escape}");
      expect(onClose).toHaveBeenCalledOnce();
    });

    it("calls onClose when backdrop is clicked", async () => {
      const user = userEvent.setup();
      const { onClose } = renderOverlay();

      const backdrop = screen.getByTestId("controls-overlay-backdrop");
      await user.click(backdrop);
      expect(onClose).toHaveBeenCalledOnce();
    });

    it("does not call onClose when panel content is clicked", async () => {
      const user = userEvent.setup();
      const { onClose } = renderOverlay();

      const shortcutLabel = screen.getByText("Pause");
      await user.click(shortcutLabel);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("formatKeyLabel", () => {
    it("converts arrow keys to unicode symbols", () => {
      expect(formatKeyLabel("ArrowUp")).toBe("↑");
      expect(formatKeyLabel("ArrowDown")).toBe("↓");
      expect(formatKeyLabel("ArrowLeft")).toBe("←");
      expect(formatKeyLabel("ArrowRight")).toBe("→");
    });

    it("uppercases single-character keys", () => {
      expect(formatKeyLabel("z")).toBe("Z");
      expect(formatKeyLabel("a")).toBe("A");
    });

    it("passes through multi-character keys unchanged", () => {
      expect(formatKeyLabel("Shift")).toBe("Shift");
      expect(formatKeyLabel("Enter")).toBe("Enter");
    });

    it("converts space to readable label", () => {
      expect(formatKeyLabel(" ")).toBe("Space");
    });
  });

  describe("isDPadBinding", () => {
    it("returns true for d-pad bindings", () => {
      expect(isDPadBinding({ key: "ArrowUp", label: "D-Pad Up" })).toBe(true);
      expect(isDPadBinding({ key: "ArrowDown", label: "D-Pad Down" })).toBe(true);
      expect(isDPadBinding({ key: "ArrowLeft", label: "D-Pad Left" })).toBe(true);
      expect(isDPadBinding({ key: "ArrowRight", label: "D-Pad Right" })).toBe(true);
    });

    it("returns false for non-d-pad bindings", () => {
      expect(isDPadBinding({ key: "z", label: "A" })).toBe(false);
      expect(isDPadBinding({ key: "Enter", label: "Start" })).toBe(false);
    });
  });
});
