import { useEffect, useRef, type RefObject } from "react";
import { findNextFocusable, type Direction, type FocusableRect } from "../lib/spatialNav";

/** Navigate the complete layout rather than just the mounted virtualized cards. */
export function useControllerGrid(
  gridRef: RefObject<HTMLDivElement | null>,
  scrollRef: RefObject<HTMLElement | null> | undefined,
  items: Array<FocusableRect>,
) {
  const pending = useRef<string | null>(null);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) {
      return;
    }
    let frame = 0;
    const focusPending = () => {
      if (!pending.current) {
        return;
      }
      const card = grid.querySelector<HTMLElement>(
        `[data-game-id="${CSS.escape(pending.current)}"]`,
      );
      if (card) {
        card.focus({ preventScroll: true });
        card.scrollIntoView({ block: "nearest", behavior: "instant" });
        pending.current = null;
      }
    };
    const navigate = (event: Event) => {
      const e = event as CustomEvent<{ direction: Direction }>;
      const card = (event.target as HTMLElement).closest<HTMLElement>("[data-game-id]");
      if (!card || event.target !== card) {
        return;
      }
      const current = items.find((item) => item.id === (pending.current ?? card.dataset.gameId));
      if (!current) {
        return;
      }
      const next = findNextFocusable(current, items, e.detail.direction);
      if (!next) {
        return;
      }
      e.preventDefault();
      pending.current = next.id;
      const scroll = scrollRef?.current;
      if (scroll) {
        const top =
          grid.getBoundingClientRect().top -
          scroll.getBoundingClientRect().top +
          scroll.scrollTop +
          next.y;
        if (top < scroll.scrollTop + 64) {
          scroll.scrollTop = Math.max(0, top - 80);
        } else if (top + next.height > scroll.scrollTop + scroll.clientHeight - 64) {
          scroll.scrollTop = top + next.height - scroll.clientHeight + 80;
        }
      }
      focusPending();
      frame = requestAnimationFrame(focusPending);
    };
    const observer = new MutationObserver(focusPending);
    observer.observe(grid, { childList: true, subtree: true });
    grid.addEventListener("gamelord:navigate-grid", navigate);
    focusPending();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      grid.removeEventListener("gamelord:navigate-grid", navigate);
    };
  }, [gridRef, scrollRef, items]);
}
