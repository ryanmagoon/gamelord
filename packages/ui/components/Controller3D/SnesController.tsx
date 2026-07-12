import React, { useMemo } from "react";
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
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
/** Near-black for recess floors and the cable. */
const RECESS_COLOR = "#2a292c";
/** Pill button color (the dark grey lozenges). */
const PILL_COLOR = "#5a5a60";
/** Emissive tint applied to a highlighted element. */
const HIGHLIGHT_EMISSIVE = "#fef08a";

/** How far a highlighted button sinks toward the shell (pressed feel). */
const PRESS_DEPTH = 0.05;

/**
 * The main shell as an extruded "stadium" (dog-bone) outline: two circular
 * lobes joined by straight top/bottom edges, with a deep bevel that rounds the
 * rim the way the real molded shell does. ExtrudeGeometry grows the outline
 * outward by `bevelSize`, so the source shape is shrunk to compensate and the
 * final footprint stays BODY.width × BODY.depth.
 */
const BodyShell: React.FC = () => {
  const geometry = useMemo(() => {
    const bevelSize = 0.14;
    const bevelThickness = 0.16;
    const lobeRadius = BODY.depth / 2 - bevelSize;
    const lobeCenterX = BODY.width / 2 - BODY.depth / 2;

    const outline = new THREE.Shape();
    outline.absarc(lobeCenterX, 0, lobeRadius, -Math.PI / 2, Math.PI / 2, false);
    outline.absarc(-lobeCenterX, 0, lobeRadius, Math.PI / 2, (3 * Math.PI) / 2, false);
    outline.closePath();

    const coreDepth = BODY.height - 2 * bevelThickness;
    const extruded = new THREE.ExtrudeGeometry(outline, {
      depth: coreDepth,
      curveSegments: 48,
      bevelEnabled: true,
      bevelThickness,
      bevelSize,
      bevelSegments: 8,
    });
    // ExtrudeGeometry emits flat-shaded (unindexed) triangles, which shows as
    // faceted banding on the rounded rim. Weld vertices and recompute smooth
    // normals for a molded-plastic look. mergeVertices only welds vertices
    // whose attributes all match, so drop the per-face UVs (nothing textures
    // the shell) and flat normals (recomputed below) first.
    extruded.deleteAttribute("uv");
    extruded.deleteAttribute("normal");
    const geo = mergeVertices(extruded, 1e-4);
    geo.computeVertexNormals();
    // Extrusion runs along +Z; lay it flat (thickness along Y) and center it.
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -coreDepth / 2, 0);
    return geo;
  }, []);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={SHELL_COLOR} roughness={0.5} metalness={0.02} />
    </mesh>
  );
};

/** A single domed face-button cap seated in a dark socket ring. */
const FaceButton: React.FC<{
  position: [number, number];
  color: string;
  pressed: boolean;
}> = ({ position, color, pressed }) => {
  const [x, z] = position;
  const y = FACE_Y + 0.05 - (pressed ? PRESS_DEPTH : 0);

  // Spherical-cap profile revolved around Y, with a short side wall that
  // sinks below the face so the open lathe bottom is never visible. A true
  // curved crown (rather than a flat top) keeps the specular hotspot small so
  // the cap color reads instead of washing out.
  const capGeometry = useMemo(() => {
    const r = FACE_BUTTON_RADIUS;
    const domeHeight = 0.085;
    // Lathe profiles must run bottom-to-top (ascending y) for outward-facing
    // normals — reversed order turns the surface inside-out.
    const profile: Array<THREE.Vector2> = [new THREE.Vector2(r, -0.09)];
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const t = (1 - i / steps) * (Math.PI / 2);
      profile.push(new THREE.Vector2(r * Math.sin(t), domeHeight * Math.cos(t)));
    }
    return new THREE.LatheGeometry(profile, 40);
  }, []);

  return (
    <group position={[x, 0, z]}>
      {/* Socket ring the cap sits in. */}
      <mesh position={[0, FACE_Y + 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[FACE_BUTTON_RADIUS * 0.98, FACE_BUTTON_RADIUS * 1.24, 40]} />
        <meshStandardMaterial color={RECESS_COLOR} roughness={0.75} />
      </mesh>
      <mesh geometry={capGeometry} position={[0, y, 0]} castShadow>
        <meshPhysicalMaterial
          color={color}
          roughness={0.4}
          metalness={0}
          clearcoat={0.15}
          clearcoatRoughness={0.35}
          emissive={HIGHLIGHT_EMISSIVE}
          emissiveIntensity={pressed ? 0.6 : 0}
        />
      </mesh>
    </group>
  );
};

/**
 * The cross-shaped d-pad: a single extruded cross outline whose bevel gives
 * the arms their molded chamfer, seated in a dark circular recess.
 */
const DPad: React.FC<{ highlighted: ReadonlySet<ControllerButtonId> }> = ({ highlighted }) => {
  const [cx, cz] = DPAD.center;
  const anyPressed = (["up", "down", "left", "right"] as const).some((id) => highlighted.has(id));

  const crossGeometry = useMemo(() => {
    const bevelSize = 0.035;
    const bevelThickness = 0.045;
    // Shrink the outline so the beveled result spans the layout dimensions.
    const arm = DPAD.armLength - bevelSize;
    const half = DPAD.armWidth - bevelSize;

    const cross = new THREE.Shape();
    cross.moveTo(-half, arm);
    cross.lineTo(half, arm);
    cross.lineTo(half, half);
    cross.lineTo(arm, half);
    cross.lineTo(arm, -half);
    cross.lineTo(half, -half);
    cross.lineTo(half, -arm);
    cross.lineTo(-half, -arm);
    cross.lineTo(-half, -half);
    cross.lineTo(-arm, -half);
    cross.lineTo(-arm, half);
    cross.lineTo(-half, half);
    cross.closePath();

    const extruded = new THREE.ExtrudeGeometry(cross, {
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness,
      bevelSize,
      bevelSegments: 4,
    });
    // Smooth-shade the chamfer (see BodyShell for why).
    extruded.deleteAttribute("uv");
    extruded.deleteAttribute("normal");
    const geo = mergeVertices(extruded, 1e-4);
    geo.computeVertexNormals();
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  const pressDrop = anyPressed ? PRESS_DEPTH * 0.6 : 0;

  return (
    <group position={[cx, 0, cz]}>
      {/* Circular recess the cross sits in. */}
      <mesh position={[0, FACE_Y + 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[DPAD.armLength + 0.12, 48]} />
        <meshStandardMaterial color={RECESS_COLOR} roughness={0.75} />
      </mesh>
      <mesh geometry={crossGeometry} position={[0, FACE_Y - 0.01 - pressDrop, 0]} castShadow>
        <meshStandardMaterial
          color={DARK_GREY}
          roughness={0.55}
          emissive={HIGHLIGHT_EMISSIVE}
          emissiveIntensity={anyPressed ? 0.5 : 0}
        />
      </mesh>
    </group>
  );
};

/** A dark-grey angled pill (Select / Start) on a recessed track plate. */
const PillButton: React.FC<{ position: [number, number]; pressed: boolean }> = ({
  position,
  pressed,
}) => {
  const [x, z] = position;
  const y = FACE_Y + 0.03 - (pressed ? PRESS_DEPTH * 0.5 : 0);
  const angle = -Math.PI / 9;

  // Flat stadium plate under the pill, elongated along the pill's axis.
  const plateGeometry = useMemo(() => {
    const plateHalfLength = 0.17;
    const plateRadius = 0.1;
    const plate = new THREE.Shape();
    plate.absarc(plateHalfLength, 0, plateRadius, -Math.PI / 2, Math.PI / 2, false);
    plate.absarc(-plateHalfLength, 0, plateRadius, Math.PI / 2, (3 * Math.PI) / 2, false);
    plate.closePath();
    return new THREE.ShapeGeometry(plate, 24);
  }, []);

  return (
    <group position={[x, 0, z]} rotation={[0, angle, 0]}>
      <mesh
        geometry={plateGeometry}
        position={[0, FACE_Y + 0.004, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial color={RECESS_COLOR} roughness={0.75} />
      </mesh>
      <mesh position={[0, y, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <capsuleGeometry args={[0.06, 0.26, 8, 16]} />
        <meshStandardMaterial
          color={PILL_COLOR}
          roughness={0.5}
          emissive={HIGHLIGHT_EMISSIVE}
          emissiveIntensity={pressed ? 0.55 : 0}
        />
      </mesh>
    </group>
  );
};

/** A shoulder bumper hugging the rear top edge. */
const Shoulder: React.FC<{ position: [number, number]; pressed: boolean }> = ({
  position,
  pressed,
}) => {
  const [x, z] = position;
  const y = FACE_Y - 0.12 - (pressed ? PRESS_DEPTH : 0);
  return (
    <RoundedBox
      args={[SHOULDERS.width, SHOULDERS.height, SHOULDERS.depth]}
      radius={0.06}
      smoothness={4}
      position={[x, y, z - 0.03]}
      rotation={[Math.PI / 10, 0, 0]}
      castShadow
    >
      <meshStandardMaterial
        color={SHELL_COLOR}
        roughness={0.5}
        emissive={HIGHLIGHT_EMISSIVE}
        emissiveIntensity={pressed ? 0.5 : 0}
      />
    </RoundedBox>
  );
};

/** Cable strain-relief boss and a short cable trailing off the top edge. */
const Cable: React.FC = () => {
  const cableGeometry = useMemo(() => {
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, -BODY.depth / 2 + 0.05),
      new THREE.Vector3(0, -0.02, -BODY.depth / 2 - 0.45),
      new THREE.Vector3(0.1, -0.16, -BODY.depth / 2 - 1.0),
      new THREE.Vector3(0.05, -0.24, -BODY.depth / 2 - 1.5),
    ]);
    return new THREE.TubeGeometry(path, 48, 0.045, 12, false);
  }, []);

  return (
    <group>
      {/* Strain-relief boss on the top edge. */}
      <RoundedBox
        args={[0.3, 0.2, 0.24]}
        radius={0.05}
        smoothness={4}
        position={[0, 0.02, -BODY.depth / 2 + 0.02]}
        castShadow
      >
        <meshStandardMaterial color={RECESS_COLOR} roughness={0.6} />
      </RoundedBox>
      <mesh geometry={cableGeometry} castShadow>
        <meshStandardMaterial color={RECESS_COLOR} roughness={0.55} />
      </mesh>
    </group>
  );
};

/**
 * A procedurally-modeled Super Nintendo controller built from extruded and
 * lathed primitives. Rendered as a flat-laid group centered at the origin; the
 * parent scene tilts and frames it. Follows the original controller's
 * proportions and palette: dog-bone shell, dark cross d-pad, domed
 * blue/green/red/yellow face buttons, angled Select/Start pills.
 */
export const SnesController: React.FC<SnesControllerProps> = ({ highlightedButtons }) => {
  const highlighted = useMemo<ReadonlySet<ControllerButtonId>>(
    () => highlightedButtons ?? new Set(),
    [highlightedButtons],
  );

  return (
    <group>
      <BodyShell />

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

      <Cable />
    </group>
  );
};
