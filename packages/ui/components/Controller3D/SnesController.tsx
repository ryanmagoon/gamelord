import React, { useMemo } from "react";
import { RoundedBox } from "@react-three/drei";
import {
  BODY,
  DPAD,
  FACE_BUTTONS,
  FACE_BUTTON_RADIUS,
  FACE_Y,
  PILL_BUTTONS,
  SHOULDERS,
  type ControllerButtonId,
} from "./controllerLayout";

export interface SnesControllerProps {
  /**
   * Buttons to render in a highlighted (pressed) state. Wired to live gamepad
   * input in a later pass — for now the staged controller passes an empty set
   * and nothing is highlighted.
   */
  highlightedButtons?: ReadonlySet<ControllerButtonId>;
}

/** Shell color — the classic light-grey SNES body. */
const SHELL_COLOR = "#cdc9c4";
/** Slightly darker grey for the d-pad and recessed wells. */
const DARK_GREY = "#3b3a3d";
/** Pill button color (the dark grey lozenges). */
const PILL_COLOR = "#5a5a60";
/** Emissive tint applied to a highlighted element. */
const HIGHLIGHT_EMISSIVE = "#fef08a";

/** How far a highlighted button sinks toward the shell (pressed feel). */
const PRESS_DEPTH = 0.05;

/** A single round face button cap. */
const FaceButton: React.FC<{
  position: [number, number];
  color: string;
  pressed: boolean;
}> = ({ position, color, pressed }) => {
  const [x, z] = position;
  const y = FACE_Y + 0.07 - (pressed ? PRESS_DEPTH : 0);
  return (
    <mesh position={[x, y, z]} castShadow>
      <cylinderGeometry args={[FACE_BUTTON_RADIUS, FACE_BUTTON_RADIUS * 0.92, 0.14, 32]} />
      <meshStandardMaterial
        color={color}
        roughness={0.45}
        metalness={0.05}
        emissive={HIGHLIGHT_EMISSIVE}
        emissiveIntensity={pressed ? 0.6 : 0}
      />
    </mesh>
  );
};

/** The cross-shaped d-pad: vertical arm, horizontal arm, and a hub. */
const DPad: React.FC<{ highlighted: ReadonlySet<ControllerButtonId> }> = ({ highlighted }) => {
  const [cx, cz] = DPAD.center;
  const y = FACE_Y + 0.04;
  const anyPressed = (["up", "down", "left", "right"] as const).some((id) => highlighted.has(id));
  const armSpan = DPAD.armLength * 2;
  const armW = DPAD.armWidth * 2;
  return (
    <group position={[cx, y, cz]}>
      {/* Vertical arm (Up/Down) */}
      <mesh castShadow>
        <boxGeometry args={[armW, 0.12, armSpan]} />
        <meshStandardMaterial
          color={DARK_GREY}
          roughness={0.6}
          emissive={HIGHLIGHT_EMISSIVE}
          emissiveIntensity={anyPressed ? 0.5 : 0}
        />
      </mesh>
      {/* Horizontal arm (Left/Right) */}
      <mesh castShadow>
        <boxGeometry args={[armSpan, 0.12, armW]} />
        <meshStandardMaterial
          color={DARK_GREY}
          roughness={0.6}
          emissive={HIGHLIGHT_EMISSIVE}
          emissiveIntensity={anyPressed ? 0.5 : 0}
        />
      </mesh>
    </group>
  );
};

/** A dark-grey angled pill (Select / Start). */
const PillButton: React.FC<{ position: [number, number]; pressed: boolean }> = ({
  position,
  pressed,
}) => {
  const [x, z] = position;
  const y = FACE_Y + 0.03 - (pressed ? PRESS_DEPTH * 0.5 : 0);
  return (
    <mesh position={[x, y, z]} rotation={[0, -Math.PI / 9, Math.PI / 2]} castShadow>
      <capsuleGeometry args={[0.06, 0.26, 8, 16]} />
      <meshStandardMaterial
        color={PILL_COLOR}
        roughness={0.5}
        emissive={HIGHLIGHT_EMISSIVE}
        emissiveIntensity={pressed ? 0.55 : 0}
      />
    </mesh>
  );
};

/** A shoulder bumper on the rear top edge. */
const Shoulder: React.FC<{ position: [number, number]; pressed: boolean }> = ({
  position,
  pressed,
}) => {
  const [x, z] = position;
  const y = FACE_Y - (pressed ? PRESS_DEPTH : 0);
  return (
    <mesh position={[x, y, z]} castShadow>
      <boxGeometry args={[SHOULDERS.width, SHOULDERS.height, SHOULDERS.depth]} />
      <meshStandardMaterial
        color={SHELL_COLOR}
        roughness={0.55}
        emissive={HIGHLIGHT_EMISSIVE}
        emissiveIntensity={pressed ? 0.5 : 0}
      />
    </mesh>
  );
};

/**
 * A procedurally-modeled Super Nintendo controller built from primitives.
 * Rendered as a flat-laid group centered at the origin; the parent scene tilts
 * and frames it. Stylized rather than photoreal — clean shapes and the
 * authentic SNES palette (light-grey shell, blue/green/red/yellow buttons).
 */
export const SnesController: React.FC<SnesControllerProps> = ({ highlightedButtons }) => {
  const highlighted = useMemo<ReadonlySet<ControllerButtonId>>(
    () => highlightedButtons ?? new Set(),
    [highlightedButtons],
  );

  return (
    <group>
      {/* Main shell */}
      <RoundedBox
        args={[BODY.width, BODY.height, BODY.depth]}
        radius={BODY.radius}
        smoothness={6}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={SHELL_COLOR} roughness={0.6} metalness={0.05} />
      </RoundedBox>

      {/* Recessed face-button well (dark disc behind the diamond) */}
      <mesh position={[0.95, FACE_Y - 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[0.62, 48]} />
        <meshStandardMaterial color={DARK_GREY} roughness={0.7} />
      </mesh>

      <DPad highlighted={highlighted} />

      {FACE_BUTTONS.map((button) => (
        <FaceButton
          key={button.id}
          position={button.position}
          color={button.color}
          pressed={highlighted.has(button.id)}
        />
      ))}

      {PILL_BUTTONS.map((pill) => (
        <PillButton key={pill.id} position={pill.position} pressed={highlighted.has(pill.id)} />
      ))}

      <Shoulder position={SHOULDERS.left.position} pressed={highlighted.has("l")} />
      <Shoulder position={SHOULDERS.right.position} pressed={highlighted.has("r")} />
    </group>
  );
};
