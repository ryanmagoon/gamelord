/**
 * Geometry layout data for the procedural 3D Super Nintendo controller.
 *
 * Positions are in the controller's local space (a flat XZ plane, +Y up). The
 * controller body is centered at the origin and laid flat so the camera looks
 * down at a slight tilt. Distances are in arbitrary scene units (the body is
 * ~3.6 wide); they only need to be internally consistent.
 *
 * Button identifiers use the libretro positional names that the rest of the app
 * already speaks (B = bottom, A = right, Y = left, X = top), so a future pass
 * can map live `buttonStates` onto these ids without a translation layer.
 */

/** Stable identifier for each highlightable element on the controller. */
export type ControllerButtonId =
  | "up"
  | "down"
  | "left"
  | "right"
  | "a"
  | "b"
  | "x"
  | "y"
  | "l"
  | "r"
  | "select"
  | "start";

/** A round face button (A/B/X/Y). */
export interface FaceButtonSpec {
  id: ControllerButtonId;
  /** Local position [x, z] on the controller face plane. */
  position: [number, number];
  /** Resting cap color (hex). */
  color: string;
  /** Printed glyph, used by the story/labels — not rendered in 3D yet. */
  label: string;
}

/** A pill-shaped center button (Select/Start). */
export interface PillButtonSpec {
  id: ControllerButtonId;
  position: [number, number];
  label: string;
}

/**
 * Body dimensions for the controller shell, proportioned to the real
 * controller (~14.5cm × 6.3cm × 2.2cm scaled so width = 3.6 units). The shell
 * is an extruded stadium outline whose end lobes have radius `depth / 2`.
 */
export const BODY = {
  width: 3.6,
  depth: 1.56,
  height: 0.52,
} as const;

/**
 * The SNES face-button diamond. Authentic SNES color scheme:
 * A/B are the right pair (A red, B yellow), X/Y the left pair (X blue, Y green).
 * Positioned as a diamond on the right side of the body.
 */
export const FACE_BUTTONS: ReadonlyArray<FaceButtonSpec> = [
  { id: "x", position: [0.95, -0.28], color: "#4f6bed", label: "X" }, // top — blue
  { id: "y", position: [0.6, 0.0], color: "#3fae6b", label: "Y" }, // left — green
  { id: "a", position: [1.3, 0.0], color: "#d2453f", label: "A" }, // right — red
  { id: "b", position: [0.95, 0.28], color: "#e7c14b", label: "B" }, // bottom — yellow
] as const;

/** Radius of a round face button cap. */
export const FACE_BUTTON_RADIUS = 0.16;

/**
 * D-pad arm positions (local [x, z]) relative to the d-pad center on the left
 * side of the body. The cross is rendered as four arms plus a hub.
 */
export const DPAD = {
  center: [-1.05, 0.0] as [number, number],
  /** Length of each arm from the hub center. */
  armLength: 0.34,
  /** Half-width of an arm. */
  armWidth: 0.16,
} as const;

/** Center pill buttons (Select/Start), angled inward toward the middle. */
export const PILL_BUTTONS: ReadonlyArray<PillButtonSpec> = [
  { id: "select", position: [-0.28, 0.45], label: "SELECT" },
  { id: "start", position: [0.28, 0.45], label: "START" },
] as const;

/** Shoulder bumpers sit on the back top edge, left (L) and right (R). */
export const SHOULDERS = {
  left: { id: "l" as ControllerButtonId, position: [-1.2, -BODY.depth / 2] as [number, number] },
  right: { id: "r" as ControllerButtonId, position: [1.2, -BODY.depth / 2] as [number, number] },
  width: 0.7,
  height: 0.22,
  depth: 0.34,
} as const;

/** Resting Y height of the controller face (top surface of the shell). */
export const FACE_Y = BODY.height / 2;
