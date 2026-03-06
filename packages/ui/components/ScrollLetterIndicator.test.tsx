import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScrollLetterIndicator } from "./ScrollLetterIndicator";

describe("ScrollLetterIndicator", () => {
  it("renders nothing when letter is null", () => {
    const { container } = render(<ScrollLetterIndicator isVisible={true} letter={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the letter text", () => {
    render(<ScrollLetterIndicator isVisible={true} letter="A" />);
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it('has aria-hidden="true"', () => {
    render(<ScrollLetterIndicator isVisible={true} letter="M" />);
    const indicator = screen.getByTestId("scroll-letter-indicator");
    expect(indicator).toHaveAttribute("aria-hidden", "true");
  });

  it("has pointer-events-none class", () => {
    render(<ScrollLetterIndicator isVisible={true} letter="Z" />);
    const indicator = screen.getByTestId("scroll-letter-indicator");
    expect(indicator.className).toContain("pointer-events-none");
  });

  it("applies opacity-100 when visible", () => {
    render(<ScrollLetterIndicator isVisible={true} letter="B" />);
    const indicator = screen.getByTestId("scroll-letter-indicator");
    expect(indicator.className).toContain("opacity-100");
    expect(indicator.className).not.toContain("opacity-0");
  });

  it("applies opacity-0 when not visible", () => {
    render(<ScrollLetterIndicator isVisible={false} letter="B" />);
    const indicator = screen.getByTestId("scroll-letter-indicator");
    expect(indicator.className).toContain("opacity-0");
    expect(indicator.className).not.toContain("opacity-100");
  });

  it("applies scale-100 when visible and scale-90 when not", () => {
    const { rerender } = render(<ScrollLetterIndicator isVisible={true} letter="C" />);
    expect(screen.getByText("C").className).toContain("scale-100");

    rerender(<ScrollLetterIndicator isVisible={false} letter="C" />);
    expect(screen.getByText("C").className).toContain("scale-90");
  });
});
