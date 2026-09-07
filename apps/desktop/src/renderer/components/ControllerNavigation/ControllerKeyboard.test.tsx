import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ControllerKeyboard } from "./ControllerKeyboard";

afterEach(cleanup);
function Form() {
  const [value, setValue] = useState("old");
  return (
    <>
      <input aria-label="Search" value={value} onChange={(event) => setValue(event.target.value)} />
      <output aria-label="Saved">{value}</output>
      <ControllerKeyboard />
    </>
  );
}
describe("controller keyboard", () => {
  it("updates a controlled React field and returns focus when applied", async () => {
    render(<Form />);
    const field = screen.getByLabelText("Search");
    field.focus();
    act(() => {
      field.dispatchEvent(new CustomEvent("gamelord:keyboard", { bubbles: true }));
    });
    fireEvent.click(await screen.findByRole("button", { name: "a" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByLabelText("Saved").textContent).toBe("olda");
    await waitFor(() => expect(document.activeElement).toBe(field));
  });
  it("discards edits on cancel", async () => {
    render(<Form />);
    act(() => {
      screen
        .getByLabelText("Search")
        .dispatchEvent(new CustomEvent("gamelord:keyboard", { bubbles: true }));
    });
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Saved").textContent).toBe("old");
  });
});
