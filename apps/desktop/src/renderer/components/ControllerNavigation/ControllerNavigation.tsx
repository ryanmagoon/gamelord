import { ControllerKeyboard } from "./ControllerKeyboard";
import { useEffect, useRef, useState } from "react";
import { detectGamepadModel, GamepadGlyph } from "@gamelord/ui";
import {
  GamepadCommands,
  loadUIBindings,
  type UICommand,
} from "../../lib/navigation/gamepadCommands";
import {
  activeScope,
  focusables,
  focusElement,
  key,
  moveFocus,
} from "../../lib/navigation/domNavigation";

interface Props {
  enabled: boolean;
  onMenu: () => void;
  onBack?: () => void;
  /** During gameplay only Home or Select + Start opens the UI. */
  gameplay?: boolean;
}

export function ControllerNavigation({ enabled, onMenu, onBack, gameplay = false }: Props) {
  const options = useRef({ enabled, onMenu, onBack, gameplay });
  options.current = { enabled, onMenu, onBack, gameplay };
  const [controller, setController] = useState<string | null>(null);
  const [inputDevice, setInputDevice] = useState("mouse");
  const [connected, setConnected] = useState(false);
  const [promptBindings, setPromptBindings] = useState(loadUIBindings);

  useEffect(() => {
    const commands = new GamepadCommands();
    let raf = 0;
    let bindings = loadUIBindings();
    let lastActivity = "";
    const reload = () => {
      bindings = loadUIBindings();
      setPromptBindings(bindings);
    };
    const input = (device: string) => {
      document.documentElement.dataset.inputDevice = device;
      setInputDevice(device);
    };
    const mouse = () => input("mouse");
    const keyboard = (event: KeyboardEvent) => {
      if (!event.isTrusted) {
        return;
      }
      input("keyboard");
      const target = event.target as HTMLElement;
      if (
        !options.current.enabled ||
        options.current.gameplay ||
        target.matches("input, textarea, select") ||
        target.isContentEditable ||
        event.altKey ||
        event.metaKey ||
        event.ctrlKey
      ) {
        return;
      }
      if (event.key.startsWith("Arrow") && activeScope() === document.body) {
        event.preventDefault();
        moveFocus(event.key.slice(5).toLowerCase() as "up" | "down" | "left" | "right");
      }
    };
    const dispatch = (command: UICommand) => {
      const opts = options.current;
      if (opts.gameplay) {
        if (command === "menu") {
          opts.onMenu();
        }
        return;
      }
      const scope = activeScope();
      let target = document.activeElement as HTMLElement;
      if (!scope.contains(target) || target === document.body) {
        const first = focusables(scope)[0];
        if (first) {
          focusElement(first);
          target = first;
        }
      }
      if (["up", "down", "left", "right"].includes(command)) {
        moveFocus(command as "up" | "down" | "left" | "right");
      } else if (command === "confirm") {
        if (target.matches('input:not([type="range"]):not([type="checkbox"]), textarea')) {
          target.dispatchEvent(new CustomEvent("gamelord:keyboard", { bubbles: true }));
        } else if (
          target.matches(
            '[role="combobox"], [role="menuitem"], [role="option"], [aria-haspopup="menu"]',
          )
        ) {
          key(target, "Enter");
        } else {
          target.click();
        }
      } else if (command === "back") {
        if (scope !== document.body) {
          key(target, "Escape");
        } else {
          opts.onBack?.();
        }
      } else if (command === "menu") {
        if (scope !== document.body) {
          key(target, "Escape");
        } else {
          opts.onMenu();
        }
      } else if (command === "context") {
        const card = target.closest("[data-game-id]");
        const menu = card?.querySelector<HTMLElement>('[aria-haspopup="menu"]');
        if (menu) {
          focusElement(menu);
          key(menu, "Enter");
        }
      } else if (command === "keyboard") {
        const field = target.matches("input, textarea")
          ? target
          : scope.querySelector<HTMLElement>(
              'input[type="text"], input[type="search"], input:not([type]), textarea',
            );
        field?.dispatchEvent(new CustomEvent("gamelord:keyboard", { bubbles: true }));
      } else if (command === "previousTab" || command === "nextTab") {
        const buttons = Array.from(
          scope.querySelectorAll<HTMLElement>("[data-controller-tab]"),
        ).filter((el) => !el.hasAttribute("disabled"));
        const current = buttons.findIndex(
          (el) =>
            el.getAttribute("aria-selected") === "true" ||
            el.getAttribute("data-active") === "true",
        );
        const next =
          buttons[(current + (command === "nextTab" ? 1 : -1) + buttons.length) % buttons.length];
        if (next) {
          next.click();
          focusElement(next);
        }
      } else if (command === "pageUp" || command === "pageDown") {
        // Multiple directional steps preserve selection across virtualized rows.
        for (let step = 0; step < 4; step++) {
          moveFocus(command === "pageUp" ? "up" : "down");
        }
      }
    };
    const poll = () => {
      const pads = navigator.getGamepads?.() ?? [];
      setConnected(Array.from(pads).some((p) => p?.connected && p.mapping === "standard"));
      const active = Array.from(pads).find(
        (pad) =>
          pad?.connected &&
          pad.mapping === "standard" &&
          (pad.buttons.some((button) => button.pressed) ||
            pad.axes.slice(0, 2).some((axis) => Math.abs(axis) > 0.5)),
      );
      const activity = active
        ? `${active.index}:${active.buttons.map((button) => Number(button.pressed)).join("")}:${active.axes
            .slice(0, 2)
            .map((axis) => (Math.abs(axis) > 0.5 ? Math.sign(axis) : 0))
            .join(",")}`
        : "";
      if (activity && activity !== lastActivity && document.hasFocus()) {
        input("gamepad");
        setController(active!.id);
      }
      lastActivity = activity;
      const capturing = !!document.querySelector('[data-controller-capture="true"]');
      const events = commands.sample(
        pads,
        performance.now(),
        options.current.enabled && document.hasFocus() && !capturing,
        bindings,
        options.current.gameplay,
      );
      for (const event of events) {
        input("gamepad");
        setController(event.controllerId);
        dispatch(event.command);
        // Opening a dialog changes input ownership. Do not activate it again in this frame.
        if (["menu", "confirm", "back"].includes(event.command)) {
          break;
        }
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    window.addEventListener("pointermove", mouse);
    window.addEventListener("pointerdown", mouse);
    window.addEventListener("keydown", keyboard);
    window.addEventListener("storage", reload);
    window.addEventListener("gamelord:ui-bindings", reload);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", mouse);
      window.removeEventListener("pointerdown", mouse);
      window.removeEventListener("keydown", keyboard);
      window.removeEventListener("storage", reload);
      window.removeEventListener("gamelord:ui-bindings", reload);
      delete document.documentElement.dataset.inputDevice;
    };
  }, []);

  if (!connected || inputDevice === "mouse" || gameplay) {
    return <ControllerKeyboard />;
  }
  const type = detectGamepadModel(controller ?? "");
  const bindings = promptBindings;
  const gamepad = inputDevice === "gamepad";
  return (
    <>
      <ControllerKeyboard />
      <div className="controller-prompts" aria-label="Controller shortcuts">
        <span>
          <kbd>{gamepad ? <GamepadGlyph button={bindings.confirm} model={type} /> : "Enter"}</kbd>{" "}
          Select
        </span>
        <span>
          <kbd>{gamepad ? <GamepadGlyph button={bindings.back} model={type} /> : "Esc"}</kbd> Back
        </span>
        <span>
          <kbd>{gamepad ? <GamepadGlyph button={bindings.menu} model={type} /> : "↑ ↓ ← →"}</kbd>{" "}
          {gamepad ? "Menu" : "Move"}
        </span>
      </div>
    </>
  );
}
