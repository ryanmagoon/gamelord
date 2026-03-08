import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ControlsOverlay } from "./ControlsOverlay";

function renderOverlay(props: Partial<Parameters<typeof ControlsOverlay>[0]> = {}) {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
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

    it("renders game controls section", () => {
      renderOverlay();
      expect(screen.getByText("Game Controls")).toBeInTheDocument();
    });

    it("renders shortcuts section", () => {
      renderOverlay();
      expect(screen.getByText("Shortcuts")).toBeInTheDocument();
    });

    it("displays all game control mappings", () => {
      renderOverlay();
      // Button labels (shown as action names)
      const buttonLabels = ["D-Pad", "A", "B", "X", "Y", "L", "R", "Select", "Start"];
      for (const label of buttonLabels) {
        // Some labels (A, X) appear both as key badges and action labels,
        // so check that at least one matching element exists
        expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
      }
    });

    it("displays all shortcut mappings", () => {
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

      const heading = screen.getByText("Game Controls");
      await user.click(heading);
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
