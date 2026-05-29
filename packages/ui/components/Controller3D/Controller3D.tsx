import React, { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls } from "@react-three/drei";
import { SnesController } from "./SnesController";
import type { ControllerButtonId } from "./controllerLayout";

export interface Controller3DProps {
  /**
   * Buttons to render pressed/highlighted. Defaults to none — the first pass
   * stages a static controller; live `buttonStates` wiring comes later.
   */
  highlightedButtons?: ReadonlySet<ControllerButtonId>;
  /** Whether the user can orbit the camera with the pointer. Default: true. */
  enableControls?: boolean;
  /** Slowly rotate the controller for an ambient "showcase" feel. Default: true. */
  autoRotate?: boolean;
  className?: string;
}

/**
 * A staged 3D Super Nintendo controller rendered with react-three-fiber.
 *
 * Presentational and self-contained: no IPC or `window.gamelord` access, so it
 * renders in Storybook and the app identically. The controller is procedurally
 * modeled (see {@link SnesController}); this wrapper owns the camera, lighting,
 * ground shadow, and orbit controls.
 */
export const Controller3D: React.FC<Controller3DProps> = ({
  highlightedButtons,
  enableControls = true,
  autoRotate = true,
  className,
}) => {
  return (
    <div className={className} style={{ width: "100%", height: "100%" }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 3.4, 5.2], fov: 36 }}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          // Keep the framebuffer readable so the canvas can be screenshotted
          // (and captured in Storybook/CI). This is a settings-panel showcase,
          // not the game canvas, so the minor compositing cost is acceptable.
          preserveDrawingBuffer: true,
        }}
      >
        {/* Key + fill + rim lighting for crisp plastic readout. */}
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[4, 6, 3]}
          intensity={2.1}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.0001}
        />
        <directionalLight position={[-5, 3, -2]} intensity={0.6} />

        <Suspense fallback={null}>
          {/* Subtle studio IBL so the plastic and colored caps catch highlights. */}
          <Environment preset="city" environmentIntensity={0.35} />

          {/* Tilt the flat-laid controller toward the camera. */}
          <group rotation={[-Math.PI / 7, 0, 0]} position={[0, 0.15, 0]}>
            <SnesController highlightedButtons={highlightedButtons} />
          </group>

          <ContactShadows
            position={[0, -0.35, 0]}
            opacity={0.45}
            scale={9}
            blur={2.4}
            far={4}
            resolution={512}
          />
        </Suspense>

        {enableControls && (
          <OrbitControls
            enablePan={false}
            enableZoom
            minDistance={3}
            maxDistance={8}
            minPolarAngle={Math.PI / 6}
            maxPolarAngle={Math.PI / 2.1}
            autoRotate={autoRotate}
            autoRotateSpeed={0.6}
            enableDamping
          />
        )}
      </Canvas>
    </div>
  );
};
