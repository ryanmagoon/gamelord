import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ControlsOverlay } from "./ControlsOverlay";
import { getControllerLayout } from "./controller-layouts";

function renderOverlay(props: Partial<Parameters<typeof ControlsOverlay>[0]> = {}) {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
  };
  return { ...render(<ControlsOverlay {...defaultProps} {...props} />), ...defaultProps };
}

/** Returns button IDs of all rendered badge elements. */
function getRenderedButtonIds(container: HTMLElement): Array<string> {
  const elements = container.querySelectorAll("[data-button-id]");
  return Array.from(elements).map((el) => el.getAttribute("data-button-id") ?? "");
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

    it("renders controller diagram with D-pad and face buttons", () => {
      const { container } = renderOverlay();
      expect(container.querySelector("[data-button-id='dpad']")).not.toBeNull();
      expect(container.querySelector("[data-button-id='a']")).not.toBeNull();
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

  describe("system-aware layouts", () => {
    it("shows all SNES buttons when no systemId is provided (fallback)", () => {
      const { container } = renderOverlay();
      const ids = getRenderedButtonIds(container);
      expect(ids).toContain("dpad");
      expect(ids).toContain("a");
      expect(ids).toContain("b");
      expect(ids).toContain("x");
      expect(ids).toContain("y");
      expect(ids).toContain("l");
      expect(ids).toContain("r");
      expect(ids).toContain("select");
      expect(ids).toContain("start");
    });

    it("shows only NES buttons for NES system", () => {
      const { container } = renderOverlay({ systemId: "nes" });
      const ids = getRenderedButtonIds(container);
      expect(ids).toContain("dpad");
      expect(ids).toContain("a");
      expect(ids).toContain("b");
      expect(ids).toContain("select");
      expect(ids).toContain("start");
      expect(ids).not.toContain("x");
      expect(ids).not.toContain("y");
      expect(ids).not.toContain("l");
      expect(ids).not.toContain("r");
    });

    it("shows L and R but not X/Y for GBA", () => {
      const { container } = renderOverlay({ systemId: "gba" });
      const ids = getRenderedButtonIds(container);
      expect(ids).toContain("l");
      expect(ids).toContain("r");
      expect(ids).not.toContain("x");
      expect(ids).not.toContain("y");
    });

    it("shows only NES buttons for Game Boy", () => {
      const { container } = renderOverlay({ systemId: "gb" });
      const ids = getRenderedButtonIds(container);
      expect(ids).toContain("dpad");
      expect(ids).toContain("a");
      expect(ids).toContain("b");
      expect(ids).toContain("select");
      expect(ids).toContain("start");
      expect(ids).not.toContain("x");
      expect(ids).not.toContain("y");
      expect(ids).not.toContain("l");
      expect(ids).not.toContain("r");
    });

    it("shows all buttons for SNES", () => {
      const { container } = renderOverlay({ systemId: "snes" });
      const ids = getRenderedButtonIds(container);
      expect(ids).toContain("dpad");
      expect(ids).toContain("a");
      expect(ids).toContain("b");
      expect(ids).toContain("x");
      expect(ids).toContain("y");
      expect(ids).toContain("l");
      expect(ids).toContain("r");
      expect(ids).toContain("select");
      expect(ids).toContain("start");
    });

    it("shows Genesis buttons (no select)", () => {
      const { container } = renderOverlay({ systemId: "genesis" });
      const ids = getRenderedButtonIds(container);
      expect(ids).toContain("dpad");
      expect(ids).toContain("a");
      expect(ids).toContain("b");
      expect(ids).toContain("x");
      expect(ids).toContain("start");
      expect(ids).not.toContain("select");
      expect(ids).not.toContain("y");
      expect(ids).not.toContain("l");
      expect(ids).not.toContain("r");
    });

    it("shows N64 buttons (no select, no x/y)", () => {
      const { container } = renderOverlay({ systemId: "n64" });
      const ids = getRenderedButtonIds(container);
      expect(ids).toContain("dpad");
      expect(ids).toContain("a");
      expect(ids).toContain("b");
      expect(ids).toContain("l");
      expect(ids).toContain("r");
      expect(ids).toContain("start");
      expect(ids).not.toContain("select");
      expect(ids).not.toContain("x");
      expect(ids).not.toContain("y");
    });

    it("renders a layout for every known system", () => {
      const systemIds = [
        "nes",
        "snes",
        "genesis",
        "gb",
        "gba",
        "n64",
        "psx",
        "psp",
        "nds",
        "saturn",
        "arcade",
      ];
      for (const id of systemIds) {
        const { container, unmount } = renderOverlay({ systemId: id });
        const ids = getRenderedButtonIds(container);
        // Every system has a D-pad and at least A + B
        expect(ids).toContain("dpad");
        expect(ids).toContain("a");
        expect(ids).toContain("b");
        unmount();
      }
    });
  });

  describe("getControllerLayout", () => {
    it("returns a layout for known systems", () => {
      const layout = getControllerLayout("nes");
      expect(layout.name).toBe("NES");
      expect(layout.faceButtons.length).toBeGreaterThan(0);
    });

    it("falls back to SNES for unknown systems", () => {
      const layout = getControllerLayout("unknown-system-xyz");
      expect(layout.name).toBe("SNES");
    });

    it("falls back to SNES when systemId is undefined", () => {
      const layout = getControllerLayout(undefined);
      expect(layout.name).toBe("SNES");
    });
  });
});
