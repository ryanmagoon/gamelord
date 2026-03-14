import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ControlsOverlay } from "./ControlsOverlay";
import type { KeyboardBinding } from "./controller-layouts";
import {
  formatKeyLabel,
  isDPadBinding,
  isShoulderBinding,
  isCenterBinding,
  isFaceBinding,
  filterBindingsForSystem,
} from "./controller-layouts";

/** Standard bindings matching the actual KEY_MAP from GameWindow. */
const STANDARD_BINDINGS: ReadonlyArray<KeyboardBinding> = [
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
        { key: "z", label: "A", retroId: 8 },
        { key: "x", label: "B", retroId: 0 },
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

  describe("spatial layout", () => {
    it("renders shoulders in their own row", () => {
      const { container } = renderOverlay();
      const shouldersRow = container.querySelector("[data-testid='shoulders-row']");
      expect(shouldersRow).not.toBeNull();
      expect(shouldersRow?.querySelector("[data-testid='binding-L']")).not.toBeNull();
      expect(shouldersRow?.querySelector("[data-testid='binding-R']")).not.toBeNull();
    });

    it("renders face buttons in the main row", () => {
      const { container } = renderOverlay();
      const mainRow = container.querySelector("[data-testid='main-row']");
      expect(mainRow).not.toBeNull();
      const faceButtons = mainRow?.querySelector("[data-testid='face-buttons']");
      expect(faceButtons).not.toBeNull();
      expect(faceButtons?.querySelector("[data-testid='binding-A']")).not.toBeNull();
      expect(faceButtons?.querySelector("[data-testid='binding-B']")).not.toBeNull();
    });

    it("renders d-pad in the main row", () => {
      const { container } = renderOverlay();
      const mainRow = container.querySelector("[data-testid='main-row']");
      expect(mainRow).not.toBeNull();
      expect(mainRow?.querySelector("[data-testid='dpad-cluster']")).not.toBeNull();
    });

    it("renders center buttons (Select, Start) in their own row", () => {
      const { container } = renderOverlay();
      const centerRow = container.querySelector("[data-testid='center-row']");
      expect(centerRow).not.toBeNull();
      expect(centerRow?.querySelector("[data-testid='binding-Select']")).not.toBeNull();
      expect(centerRow?.querySelector("[data-testid='binding-Start']")).not.toBeNull();
    });

    it("omits shoulders row when no shoulder bindings exist", () => {
      const bindings = STANDARD_BINDINGS.filter((b) => b.label !== "L" && b.label !== "R");
      const { container } = renderOverlay({ bindings });
      expect(container.querySelector("[data-testid='shoulders-row']")).toBeNull();
    });

    it("omits center row when no center bindings exist", () => {
      const bindings = STANDARD_BINDINGS.filter((b) => b.label !== "Select" && b.label !== "Start");
      const { container } = renderOverlay({ bindings });
      expect(container.querySelector("[data-testid='center-row']")).toBeNull();
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
      expect(isDPadBinding({ key: "ArrowUp", label: "D-Pad Up", retroId: 4 })).toBe(true);
      expect(isDPadBinding({ key: "ArrowDown", label: "D-Pad Down", retroId: 5 })).toBe(true);
      expect(isDPadBinding({ key: "ArrowLeft", label: "D-Pad Left", retroId: 6 })).toBe(true);
      expect(isDPadBinding({ key: "ArrowRight", label: "D-Pad Right", retroId: 7 })).toBe(true);
    });

    it("returns false for non-d-pad bindings", () => {
      expect(isDPadBinding({ key: "z", label: "A", retroId: 8 })).toBe(false);
      expect(isDPadBinding({ key: "Enter", label: "Start", retroId: 3 })).toBe(false);
    });
  });

  describe("binding classification", () => {
    it("isShoulderBinding identifies L and R", () => {
      expect(isShoulderBinding({ key: "q", label: "L", retroId: 10 })).toBe(true);
      expect(isShoulderBinding({ key: "w", label: "R", retroId: 11 })).toBe(true);
      expect(isShoulderBinding({ key: "z", label: "A", retroId: 8 })).toBe(false);
    });

    it("isCenterBinding identifies Select and Start", () => {
      expect(isCenterBinding({ key: "Shift", label: "Select", retroId: 2 })).toBe(true);
      expect(isCenterBinding({ key: "Enter", label: "Start", retroId: 3 })).toBe(true);
      expect(isCenterBinding({ key: "z", label: "A", retroId: 8 })).toBe(false);
    });

    it("isFaceBinding identifies face buttons (not d-pad, shoulder, or center)", () => {
      expect(isFaceBinding({ key: "z", label: "A", retroId: 8 })).toBe(true);
      expect(isFaceBinding({ key: "x", label: "B", retroId: 0 })).toBe(true);
      expect(isFaceBinding({ key: "q", label: "L", retroId: 10 })).toBe(false);
      expect(isFaceBinding({ key: "Enter", label: "Start", retroId: 3 })).toBe(false);
      expect(isFaceBinding({ key: "ArrowUp", label: "D-Pad Up", retroId: 4 })).toBe(false);
    });
  });

  describe("filterBindingsForSystem", () => {
    it("returns all bindings when systemId is undefined", () => {
      const result = filterBindingsForSystem(STANDARD_BINDINGS);
      expect(result).toHaveLength(STANDARD_BINDINGS.length);
    });

    it("returns all bindings for unknown systemId (fallback to all)", () => {
      const result = filterBindingsForSystem(STANDARD_BINDINGS, "unknown-system");
      expect(result).toHaveLength(STANDARD_BINDINGS.length);
    });

    it("NES excludes X, Y, L, R", () => {
      const result = filterBindingsForSystem(STANDARD_BINDINGS, "nes");
      const labels = result.map((b) => b.label);
      expect(labels).toContain("A");
      expect(labels).toContain("B");
      expect(labels).toContain("Select");
      expect(labels).toContain("Start");
      expect(labels).toContain("D-Pad Up");
      expect(labels).not.toContain("X");
      expect(labels).not.toContain("Y");
      expect(labels).not.toContain("L");
      expect(labels).not.toContain("R");
    });

    it("GBA excludes X and Y but keeps L and R", () => {
      const result = filterBindingsForSystem(STANDARD_BINDINGS, "gba");
      const labels = result.map((b) => b.label);
      expect(labels).toContain("A");
      expect(labels).toContain("B");
      expect(labels).toContain("L");
      expect(labels).toContain("R");
      expect(labels).not.toContain("X");
      expect(labels).not.toContain("Y");
    });

    it("Genesis excludes L, R, Select, Y and relabels X as C", () => {
      const result = filterBindingsForSystem(STANDARD_BINDINGS, "genesis");
      const labels = result.map((b) => b.label);
      expect(labels).toContain("A");
      expect(labels).toContain("B");
      expect(labels).toContain("C");
      expect(labels).not.toContain("X");
      expect(labels).toContain("Start");
      expect(labels).not.toContain("L");
      expect(labels).not.toContain("R");
      expect(labels).not.toContain("Select");
      expect(labels).not.toContain("Y");
    });

    it("N64 excludes X, Y, Select", () => {
      const result = filterBindingsForSystem(STANDARD_BINDINGS, "n64");
      const labels = result.map((b) => b.label);
      expect(labels).toContain("A");
      expect(labels).toContain("B");
      expect(labels).toContain("L");
      expect(labels).toContain("R");
      expect(labels).toContain("Start");
      expect(labels).not.toContain("X");
      expect(labels).not.toContain("Y");
      expect(labels).not.toContain("Select");
    });

    it("SNES includes all standard buttons", () => {
      const result = filterBindingsForSystem(STANDARD_BINDINGS, "snes");
      expect(result).toHaveLength(STANDARD_BINDINGS.length);
    });
  });
});
