import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UpdateNotification } from "./UpdateNotification";
import type { UpdateStatus, UpdateProgress } from "./UpdateNotification";

const defaultProps = {
  status: "idle" as UpdateStatus,
  onRestart: vi.fn(),
  onDismiss: vi.fn(),
};

describe("UpdateNotification", () => {
  describe("idle state", () => {
    it("renders nothing when status is idle", () => {
      const { container } = render(<UpdateNotification {...defaultProps} />);
      expect(container.innerHTML).toBe("");
    });
  });

  describe("checking state", () => {
    it("shows checking message", () => {
      render(<UpdateNotification {...defaultProps} status="checking" />);
      expect(screen.getByText("Checking for updates...")).toBeInTheDocument();
    });
  });

  describe("available state", () => {
    it("shows version in the available message", () => {
      render(<UpdateNotification {...defaultProps} status="available" version="2.0.0" />);
      expect(screen.getByText(/Update v2\.0\.0 available/)).toBeInTheDocument();
    });
  });

  describe("downloading state", () => {
    const progress: UpdateProgress = {
      percent: 45,
      bytesPerSecond: 2_500_000,
      transferred: 4_500_000,
      total: 10_000_000,
    };

    it("shows download progress with speed", () => {
      render(
        <UpdateNotification
          {...defaultProps}
          status="downloading"
          version="2.0.0"
          progress={progress}
        />,
      );
      expect(screen.getByText(/Downloading v2\.0\.0/)).toBeInTheDocument();
    });

    it("shows progress percentage", () => {
      render(
        <UpdateNotification
          {...defaultProps}
          status="downloading"
          version="2.0.0"
          progress={progress}
        />,
      );
      expect(screen.getByText("45%")).toBeInTheDocument();
    });

    it("renders a progress bar", () => {
      const { container } = render(
        <UpdateNotification
          {...defaultProps}
          status="downloading"
          version="2.0.0"
          progress={progress}
        />,
      );
      const progressBar = container.querySelector('[style*="width: 45%"]');
      expect(progressBar).toBeTruthy();
    });
  });

  describe("downloaded state", () => {
    it("shows restart message with version", () => {
      render(<UpdateNotification {...defaultProps} status="downloaded" version="2.0.0" />);
      expect(screen.getByText(/Update v2\.0\.0 ready/)).toBeInTheDocument();
    });

    it("shows a restart button", () => {
      render(<UpdateNotification {...defaultProps} status="downloaded" version="2.0.0" />);
      expect(screen.getByRole("button", { name: /restart now/i })).toBeInTheDocument();
    });

    it("calls onRestart when restart button is clicked", async () => {
      const onRestart = vi.fn();
      const user = userEvent.setup();
      render(
        <UpdateNotification
          {...defaultProps}
          status="downloaded"
          version="2.0.0"
          onRestart={onRestart}
        />,
      );
      await user.click(screen.getByRole("button", { name: /restart now/i }));
      expect(onRestart).toHaveBeenCalledOnce();
    });

    it("shows a dismiss button", () => {
      render(<UpdateNotification {...defaultProps} status="downloaded" version="2.0.0" />);
      expect(screen.getByRole("button", { name: /dismiss/i })).toBeInTheDocument();
    });

    it("calls onDismiss when dismiss button is clicked", async () => {
      const onDismiss = vi.fn();
      const user = userEvent.setup();
      render(
        <UpdateNotification
          {...defaultProps}
          status="downloaded"
          version="2.0.0"
          onDismiss={onDismiss}
        />,
      );
      await user.click(screen.getByRole("button", { name: /dismiss/i }));
      expect(onDismiss).toHaveBeenCalledOnce();
    });
  });

  describe("error state", () => {
    it("shows error message", () => {
      render(<UpdateNotification {...defaultProps} status="error" error="Network timeout" />);
      expect(screen.getByText("Network timeout")).toBeInTheDocument();
    });

    it("shows default error message when none provided", () => {
      render(<UpdateNotification {...defaultProps} status="error" />);
      expect(screen.getByText("Update check failed")).toBeInTheDocument();
    });

    it("shows a dismiss button", () => {
      render(<UpdateNotification {...defaultProps} status="error" />);
      expect(screen.getByRole("button", { name: /dismiss/i })).toBeInTheDocument();
    });
  });
});
