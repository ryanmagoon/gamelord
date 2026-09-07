import { LIBRETRO_BUTTON } from "../../gamepad/mappings";
export interface ControllerInput {
  buttonStates?: Record<number, boolean>;
  buttonValues?: Record<number, number>;
  axisValues?: Array<number>;
  highlightedButton?: number | null;
}

function bounded(value: number | undefined, min: number, max: number) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value!)) : 0;
}

export function buttonAmount(input: ControllerInput, index: number) {
  const value = input.buttonValues?.[index];
  return value === undefined ? Number(Boolean(input.buttonStates?.[index])) : bounded(value, 0, 1);
}

export type DpadDirection = "up" | "down" | "left" | "right";
const directionButtons = {
  up: LIBRETRO_BUTTON.UP,
  down: LIBRETRO_BUTTON.DOWN,
  left: LIBRETRO_BUTTON.LEFT,
  right: LIBRETRO_BUTTON.RIGHT,
} as const;

export interface ControlMetadata {
  buttonIndex?: number;
  dpadDirection?: DpadDirection;
  role?: "dpad";
  axisIndices?: [number, number];
  axisMode: "tilt" | "translate";
  axisTravel: number;
  hingeAxis?: "X" | "Y" | "Z";
  hingeAngle: number;
  pressDepth: number;
  tiltAngle: number;
}

export interface ControlPose {
  position?: [number, number, number];
  rotation?: [number, number, number];
}

/** GLB extras describe semantic libretro controls, independently of mesh names. */
export function readControlMetadata(extras: Record<string, unknown>): ControlMetadata | null {
  const direction =
    typeof extras.dpadDirection === "string" &&
    Object.hasOwn(directionButtons, extras.dpadDirection)
      ? (extras.dpadDirection as DpadDirection)
      : undefined;
  const rawIndex =
    extras.gamepadButtonIndex ??
    extras.buttonIndex ??
    (direction ? directionButtons[direction] : undefined);
  const buttonIndex =
    typeof rawIndex === "number" && Number.isInteger(rawIndex) && rawIndex >= 0
      ? rawIndex
      : undefined;
  const rawAxes = extras.axisIndices;
  const axisIndices =
    Array.isArray(rawAxes) &&
    rawAxes.length === 2 &&
    rawAxes.every((axis) => typeof axis === "number" && Number.isInteger(axis) && axis >= 0)
      ? (rawAxes as [number, number])
      : undefined;
  const role = extras.controlRole === "dpad" ? "dpad" : undefined;
  if (buttonIndex === undefined && !axisIndices && !role) {
    return null;
  }
  const option = (key: string, defaultValue: number) =>
    typeof extras[key] === "number" && Number.isFinite(extras[key])
      ? (extras[key] as number)
      : defaultValue;
  return {
    buttonIndex,
    dpadDirection: direction,
    role,
    axisIndices,
    axisMode: extras.axisMode === "translate" ? "translate" : "tilt",
    axisTravel: Math.max(0, option("axisTravel", 0.025)),
    hingeAxis:
      extras.hingeAxis === "X" || extras.hingeAxis === "Y" || extras.hingeAxis === "Z"
        ? extras.hingeAxis
        : undefined,
    hingeAngle: option("hingeAngle", 0.28),
    pressDepth: Math.max(0, option("pressDepth", 0.015)),
    tiltAngle: option("tiltAngle", role === "dpad" ? 0.09 : 0.3),
  };
}

export function dpadButtonAtPoint(x: number, y: number): number {
  return Math.abs(x) > Math.abs(y)
    ? x > 0
      ? directionButtons.right
      : directionButtons.left
    : y > 0
      ? directionButtons.up
      : directionButtons.down;
}

export function controlButtonIndices(control: ControlMetadata): Array<number> {
  return control.role === "dpad"
    ? Object.values(directionButtons)
    : control.buttonIndex === undefined
      ? []
      : [control.buttonIndex];
}

/** Local pose deltas keep original asset geometry and tangent orientations intact. */
export function controlPose(
  control: ControlMetadata,
  input: ControllerInput,
  rockerChild = false,
): ControlPose {
  const position: [number, number, number] = [0, 0, 0];
  const rotation: [number, number, number] = [0, 0, 0];
  if (control.role === "dpad") {
    rotation[0] =
      (buttonAmount(input, directionButtons.down) - buttonAmount(input, directionButtons.up)) *
      control.tiltAngle;
    rotation[1] =
      (buttonAmount(input, directionButtons.right) - buttonAmount(input, directionButtons.left)) *
      control.tiltAngle;
  } else {
    if (control.axisIndices) {
      const x = bounded(input.axisValues?.[control.axisIndices[0]], -1, 1);
      const y = bounded(input.axisValues?.[control.axisIndices[1]], -1, 1);
      if (control.axisMode === "translate") {
        position[0] = x * control.axisTravel;
        position[1] = -y * control.axisTravel;
      } else {
        rotation[0] = y * control.tiltAngle;
        rotation[1] = x * control.tiltAngle;
      }
    }
    if (control.buttonIndex !== undefined) {
      const amount = buttonAmount(input, control.buttonIndex);
      if (control.hingeAxis) {
        rotation[{ X: 0, Y: 1, Z: 2 }[control.hingeAxis]] = amount * control.hingeAngle;
      } else if (!rockerChild) {
        position[2] = -amount * control.pressDepth;
      }
    }
  }
  return { position, rotation };
}

/** Finite settling avoids imperceptible animation keeping the GPU awake. */
export function settle(current: number, target: number, elapsedMs: number, reducedMotion: boolean) {
  if (reducedMotion || Math.abs(current - target) < 0.0001) {
    return target;
  }
  const next = current + (target - current) * (1 - Math.exp(-Math.min(elapsedMs, 64) / 30));
  return Math.abs(next - target) < 0.0001 ? target : next;
}

/** One pending callback maximum, with no callback left after a settled draw. */
export function createDemandLoop(
  draw: (time: number) => boolean,
  request = requestAnimationFrame,
  cancel = cancelAnimationFrame,
) {
  let frame: number | null = null;
  let disposed = false;
  const invalidate = () => {
    if (!disposed && frame === null) {
      frame = request((time) => {
        frame = null;
        if (!disposed && draw(time)) {
          invalidate();
        }
      });
    }
  };
  return {
    invalidate,
    dispose() {
      disposed = true;
      if (frame !== null) {
        cancel(frame);
      }
      frame = null;
    },
  };
}
