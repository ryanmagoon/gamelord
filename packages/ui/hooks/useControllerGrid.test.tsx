import { createRef } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useControllerGrid } from "./useControllerGrid";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});
it("scrolls to an unmounted card and focuses it when virtualization mounts it", async () => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  const gridRef = createRef<HTMLDivElement>();
  const scrollRef = createRef<HTMLDivElement>();
  scrollRef.current = document.createElement("div");
  gridRef.current = document.createElement("div");
  scrollRef.current.append(gridRef.current);
  document.body.append(scrollRef.current);
  Object.defineProperty(scrollRef.current, "clientHeight", { value: 400 });
  const card = document.createElement("button");
  card.dataset.gameId = "0";
  gridRef.current.append(card);
  card.focus();
  const items = Array.from({ length: 150 }, (_, index) => ({
    id: String(index),
    x: 0,
    y: index * 200,
    width: 200,
    height: 180,
  }));
  renderHook(() => useControllerGrid(gridRef, scrollRef, items));
  act(() => {
    for (let i = 0; i < 4; i++) {
      const event = new CustomEvent("gamelord:navigate-grid", {
        bubbles: true,
        cancelable: true,
        detail: { direction: "down" },
      });
      expect(card.dispatchEvent(event)).toBe(false);
    }
  });
  expect(scrollRef.current.scrollTop).toBeGreaterThan(600);
  const next = document.createElement("button");
  next.dataset.gameId = "4";
  await act(async () => {
    gridRef.current!.append(next);
  });
  expect(document.activeElement).toBe(next);
});
