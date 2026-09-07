import { useEffect, useRef, useState } from "react";
import { Button, GamepadGlyph, detectGamepadModel } from "@gamelord/ui";
import {
  defaultUIBindings,
  loadUIBindings,
  remapUIBinding,
  UI_BINDINGS_KEY,
  type UICommand,
} from "../../lib/navigation/gamepadCommands";

const labels: Record<UICommand, string> = {
  confirm: "Select",
  back: "Back",
  context: "Game options",
  keyboard: "On-screen keyboard",
  previousTab: "Previous tab",
  nextTab: "Next tab",
  pageUp: "Scroll up",
  pageDown: "Scroll down",
  menu: "Open menu",
  up: "Move up",
  down: "Move down",
  left: "Move left",
  right: "Move right",
};
export function ControllerPreferences({ controllerId = "" }: { controllerId?: string }) {
  const [bindings, setBindings] = useState(loadUIBindings);
  const [capture, setCapture] = useState<UICommand | null>(null);
  const previous = useRef(new Set<string>());
  const save = (next: typeof bindings) => {
    localStorage.setItem(UI_BINDINGS_KEY, JSON.stringify(next));
    setBindings(next);
    window.dispatchEvent(new Event("gamelord:ui-bindings"));
  };
  useEffect(() => {
    if (!capture) {
      return;
    }
    let frame = 0;
    let ready = false;
    let first = true;
    const poll = () => {
      const pressed = new Set<string>();
      const pads = navigator.getGamepads?.() ?? [];
      for (const pad of Array.from(pads)) {
        if (!pad || pad.mapping !== "standard") {
          continue;
        }
        for (let i = 0; i < pad.buttons.length; i++) {
          if (pad.buttons[i].pressed) {
            const key = `${pad.index}:${i}`;
            pressed.add(key);
            if (!first && ready && !previous.current.has(key)) {
              if (i === 16) {
                setCapture(null);
                return;
              }
              if (i <= 15) {
                save(remapUIBinding(bindings, capture, i));
                setCapture(null);
                return;
              }
            }
          }
        }
      }
      if (pressed.size === 0) {
        ready = true;
      }
      first = false;
      previous.current = pressed;
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    const timeout = setTimeout(() => setCapture(null), 10_000);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
    };
  }, [capture, bindings]);
  return (
    <section
      className="space-y-3 mt-6"
      data-controller-capture={capture !== null}
      aria-label="Controller menu bindings"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Menu controls</h3>
        <Button size="sm" variant="outline" onClick={() => save({ ...defaultUIBindings })}>
          Reset
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Separate from game controls. Conflicting bindings swap. Home always opens the menu.
      </p>
      {capture && (
        <div role="status" className="rounded-lg border p-3 text-sm">
          Release all buttons, then press a button for {labels[capture]}. Home cancels.
          Automatically cancels in 10 seconds.
          <Button variant="ghost" onClick={() => setCapture(null)}>
            Cancel
          </Button>
        </div>
      )}
      <div className="grid gap-1">
        {(Object.keys(labels) as Array<UICommand>).map((command) => (
          <Button
            key={command}
            variant="ghost"
            className="justify-between h-11"
            onClick={() => setCapture(command)}
          >
            <span>{labels[command]}</span>
            <GamepadGlyph button={bindings[command]} model={detectGamepadModel(controllerId)} />
          </Button>
        ))}
      </div>
    </section>
  );
}
