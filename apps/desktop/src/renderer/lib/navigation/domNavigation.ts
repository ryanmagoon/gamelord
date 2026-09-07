import { findNextFocusable, type Direction } from "@gamelord/ui";

const focusableSelector =
  'button, a[href], input, select, textarea, [tabindex], [role="menuitem"], [role="option"]';
const closedOverlaySelector =
  '[role="dialog"][data-state="closed"], [role="alertdialog"][data-state="closed"], [role="menu"][data-state="closed"], [role="listbox"][data-state="closed"]';
export function isAvailable(element: HTMLElement): boolean {
  return (
    !element.closest(
      `[inert], [hidden], [aria-hidden="true"], [aria-disabled="true"], [disabled], ${closedOverlaySelector}`,
    ) &&
    element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== "hidden"
  );
}
export function activeScope(): HTMLElement {
  const overlays = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]',
    ),
  ).filter((element) => element.dataset.state !== "closed" && isAvailable(element));
  return overlays.at(-1) ?? document.body;
}
export function focusables(scope: HTMLElement): Array<HTMLElement> {
  return Array.from(scope.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (el) =>
      (isAvailable(el) && el.tabIndex >= 0) ||
      (isAvailable(el) &&
        (el.getAttribute("role") === "menuitem" || el.getAttribute("role") === "option")),
  );
}
export function focusElement(element: HTMLElement) {
  element.focus({ preventScroll: true });
  element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
}
export function key(element: Element, value: string) {
  element.dispatchEvent(
    new KeyboardEvent("keydown", { key: value, code: value, bubbles: true, cancelable: true }),
  );
  element.dispatchEvent(
    new KeyboardEvent("keyup", { key: value, code: value, bubbles: true, cancelable: true }),
  );
}
export function moveFocus(direction: Direction): void {
  const scope = activeScope();
  const current = document.activeElement as HTMLElement | null;
  const candidates = focusables(scope);
  if (!current || !candidates.includes(current)) {
    if (candidates[0]) {
      focusElement(candidates[0]);
    }
    return;
  }
  // Existing composite widgets retain their own arrow-key semantics.
  if (
    scope.matches('[role="menu"], [role="listbox"]') ||
    current.matches('[role="slider"], select')
  ) {
    key(current, `Arrow${direction[0].toUpperCase()}${direction.slice(1)}`);
    return;
  }
  if (
    current instanceof HTMLInputElement &&
    current.type === "range" &&
    (direction === "left" || direction === "right")
  ) {
    const step = Number(current.step) || 1;
    const value = Math.min(
      Number(current.max || 100),
      Math.max(
        Number(current.min || 0),
        Number(current.value) + (direction === "right" ? step : -step),
      ),
    );
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
      current,
      String(value),
    );
    current.dispatchEvent(new Event("input", { bubbles: true }));
    current.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  // Virtualized libraries own their complete geometry, including unmounted cards.
  const request = new CustomEvent("gamelord:navigate-grid", {
    bubbles: true,
    cancelable: true,
    detail: { direction },
  });
  if (!current.dispatchEvent(request)) {
    return;
  }
  const rects = candidates.map((element, index) => ({ id: String(index), ...rectOf(element) }));
  const currentRect = rects[candidates.indexOf(current)];
  const region = current.closest("[data-controller-region]");
  const regional = region
    ? rects.filter((rect) => region.contains(candidates[Number(rect.id)]))
    : [];
  const next =
    findNextFocusable(currentRect, regional, direction) ??
    findNextFocusable(currentRect, rects, direction);
  if (next) {
    focusElement(candidates[Number(next.id)]);
  }
}
function rectOf(element: HTMLElement) {
  const r = element.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}
