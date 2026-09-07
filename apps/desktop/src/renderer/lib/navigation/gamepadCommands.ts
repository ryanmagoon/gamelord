/** UI bindings are deliberately independent from libretro gameplay bindings. */
export const defaultUIBindings = {
  confirm: 0,
  back: 1,
  context: 2,
  keyboard: 3,
  previousTab: 4,
  nextTab: 5,
  pageUp: 6,
  pageDown: 7,
  menu: 9,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;
export type UICommand = keyof typeof defaultUIBindings;
export type UIBindings = Record<UICommand, number>;
export const UI_BINDINGS_KEY = "gamelord:uiBindings";
export const repeatableCommands = new Set<UICommand>([
  "up",
  "down",
  "left",
  "right",
  "pageUp",
  "pageDown",
]);

export function loadUIBindings(): UIBindings {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(UI_BINDINGS_KEY) ?? "null");
    if (!saved || typeof saved !== "object") {
      return { ...defaultUIBindings };
    }
    const result = { ...defaultUIBindings } as UIBindings;
    for (const command of Object.keys(result) as Array<UICommand>) {
      const value = (saved as Record<string, unknown>)[command];
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 15) {
        return { ...defaultUIBindings };
      }
      result[command] = value;
    }
    return new Set(Object.values(result)).size === Object.keys(result).length
      ? result
      : { ...defaultUIBindings };
  } catch {
    return { ...defaultUIBindings };
  }
}

export function remapUIBinding(
  bindings: UIBindings,
  command: UICommand,
  button: number,
): UIBindings {
  const result = { ...bindings };
  const displaced = (Object.keys(result) as Array<UICommand>).find((key) => result[key] === button);
  if (displaced) {
    result[displaced] = result[command];
  }
  result[command] = button;
  return result;
}

export function pressedCommands(pad: Gamepad, bindings: UIBindings): Set<UICommand> {
  const pressed = new Set<UICommand>();
  for (const command of Object.keys(bindings) as Array<UICommand>) {
    if (pad.buttons[bindings[command]]?.pressed) {
      pressed.add(command);
    }
  }
  // Guide is reserved so remapping cannot make the overlay inaccessible.
  if (pad.buttons[16]?.pressed) {
    pressed.add("menu");
  }
  const x = pad.axes[0] ?? 0;
  const y = pad.axes[1] ?? 0;
  // Dominant-axis navigation avoids diagonal double steps.
  if (Math.max(Math.abs(x), Math.abs(y)) > 0.5) {
    pressed.add(Math.abs(x) > Math.abs(y) ? (x < 0 ? "left" : "right") : y < 0 ? "up" : "down");
  }
  return pressed;
}

interface DeviceState {
  id: string;
  held: Map<UICommand, { since: number; repeatAt: number }>;
}

/** Sample on every frame, including while disabled, to consume held transitions. */
export class GamepadCommands {
  private devices = new Map<number, DeviceState>();
  private enabled = false;

  sample(pads: ArrayLike<Gamepad | null>, now: number, enabled: boolean, bindings: UIBindings) {
    const events: Array<{ command: UICommand; controllerId: string }> = [];
    const connected = new Set<number>();
    for (const pad of Array.from(pads)) {
      if (!pad?.connected || pad.mapping !== "standard") {
        continue;
      }
      connected.add(pad.index);
      let device = this.devices.get(pad.index);
      const seed = !device || device.id !== pad.id || enabled !== this.enabled;
      if (!device || device.id !== pad.id) {
        device = { id: pad.id, held: new Map() };
        this.devices.set(pad.index, device);
      }
      const pressed = pressedCommands(pad, bindings);
      for (const command of device.held.keys()) {
        if (!pressed.has(command)) {
          device.held.delete(command);
        }
      }
      for (const command of pressed) {
        const previous = device.held.get(command);
        if (!previous || seed) {
          device.held.set(command, { since: now, repeatAt: seed ? Infinity : now + 400 });
          if (!seed && enabled) {
            events.push({ command, controllerId: pad.id });
          }
        } else if (enabled && repeatableCommands.has(command) && now >= previous.repeatAt) {
          previous.repeatAt = now + 90;
          events.push({ command, controllerId: pad.id });
        }
      }
    }
    for (const index of this.devices.keys()) {
      if (!connected.has(index)) {
        this.devices.delete(index);
      }
    }
    this.enabled = enabled;
    return events;
  }
}
