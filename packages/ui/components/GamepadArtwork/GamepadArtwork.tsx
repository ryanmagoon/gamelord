import { Component, lazy, Suspense, type ReactNode } from "react";
import { retroSystem, type RetroSystemId } from "./retroSystems";
const GamepadScene = lazy(() => import("./GamepadScene"));

export type GamepadModel = "xbox" | "dualsense" | "dualshock" | "switch" | "generic";
export function detectGamepadModel(id: string): GamepadModel {
  const name = id.toLowerCase();
  if (
    name.includes("dualsense") ||
    (name.includes("054c") && (name.includes("0ce6") || name.includes("0df2")))
  ) {
    return "dualsense";
  }
  if (
    name.includes("dualshock") ||
    (name.includes("054c") && (name.includes("05c4") || name.includes("09cc")))
  ) {
    return "dualshock";
  }
  if (name.includes("xbox") || name.includes("xinput") || name.includes("045e")) {
    return "xbox";
  }
  if (
    (name.includes("switch") && name.includes("pro")) ||
    name.includes("pro controller") ||
    (name.includes("057e") && name.includes("2009"))
  ) {
    return "switch";
  }
  return "generic";
}
export function physicalButtonLabel(index: number, model: GamepadModel): string {
  const ps = model === "dualsense" || model === "dualshock";
  const face = ps
    ? ["Cross", "Circle", "Square", "Triangle"]
    : model === "switch"
      ? ["B", "A", "Y", "X"]
      : model === "generic"
        ? ["South", "East", "West", "North"]
        : ["A", "B", "X", "Y"];
  return (
    [
      ...face,
      ps ? "L1" : model === "switch" ? "L" : "LB",
      ps ? "R1" : model === "switch" ? "R" : "RB",
      ps ? "L2" : model === "switch" ? "ZL" : "LT",
      ps ? "R2" : model === "switch" ? "ZR" : "RT",
      ps ? (model === "dualsense" ? "Create" : "Share") : model === "switch" ? "Minus" : "View",
      ps ? "Options" : model === "switch" ? "Plus" : "Menu",
      "L3",
      "R3",
      "Up",
      "Down",
      "Left",
      "Right",
      "Home",
      ps ? "Touchpad" : model === "xbox" ? "Share" : model === "switch" ? "Capture" : "Button 17",
      model === "dualsense" ? "Mute" : "Button 18",
    ][index] ?? `Button ${index}`
  );
}

export function GamepadGlyph({
  button,
  model = "generic",
  className,
}: {
  button: number;
  model?: GamepadModel;
  className?: string;
}) {
  const ps = model === "dualsense" || model === "dualshock";
  const label = physicalButtonLabel(button, model);
  return (
    <svg
      viewBox="0 0 32 32"
      width="28"
      height="28"
      role="img"
      aria-label={label}
      className={className}
    >
      <rect
        x="2"
        y="2"
        width="28"
        height="28"
        rx={button < 4 ? 14 : 7}
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeOpacity="0.65"
      />
      {ps && button < 4 ? (
        <g stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round">
          {button === 0 && <path d="m11 11 10 10m0-10L11 21" />}
          {button === 1 && <circle cx="16" cy="16" r="6" />}
          {button === 2 && <rect x="10" y="10" width="12" height="12" />}
          {button === 3 && <path d="m16 9 7 13H9Z" />}
        </g>
      ) : (
        <text
          x="16"
          y="17"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="currentColor"
          fontSize={label.length > 3 ? 9 : 12}
          fontWeight="700"
        >
          {button >= 12 && button <= 15
            ? ["↑", "↓", "←", "→"][button - 12]
            : label === "Menu" || label === "Options"
              ? "☰"
              : label === "View"
                ? "▣"
                : model === "generic" && button < 4
                  ? ["↓", "→", "←", "↑"][button]
                  : label}
        </text>
      )}
    </svg>
  );
}

export interface GamepadArtworkProps {
  onButtonSelect?: (index: number) => void;
  systemId?: RetroSystemId;
  buttonStates?: Record<number, boolean>;
  buttonValues?: Record<number, number>;
  axisValues?: Array<number>;
  highlightedButton?: number | null;
  className?: string;
}

export function GamepadSceneStatus({ error = false }: { error?: boolean }) {
  return (
    <div
      role="status"
      className="flex h-full items-center justify-center text-sm text-muted-foreground"
    >
      {error ? "3D controller unavailable." : "Loading 3D controller…"}
    </div>
  );
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <GamepadSceneStatus error /> : this.props.children;
  }
}

const retroAssets: Record<RetroSystemId, string> = {
  nes: new URL("./models/retro/nes.glb", import.meta.url).href,
  snes: new URL("./models/retro/snes.glb", import.meta.url).href,
  genesis: new URL("./models/retro/genesis.glb", import.meta.url).href,
  gb: new URL("./models/retro/gb.glb", import.meta.url).href,
  gbc: new URL("./models/retro/gbc.glb", import.meta.url).href,
  gba: new URL("./models/retro/gba.glb", import.meta.url).href,
  n64: new URL("./models/retro/n64.glb", import.meta.url).href,
  psx: new URL("./models/retro/psx.glb", import.meta.url).href,
  psp: new URL("./models/retro/psp.glb", import.meta.url).href,
  nds: new URL("./models/retro/nds.glb", import.meta.url).href,
  saturn: new URL("./models/retro/saturn.glb", import.meta.url).href,
  gamecube: new URL("./models/retro/gamecube.glb", import.meta.url).href,
  arcade: new URL("./models/retro/arcade.glb", import.meta.url).href,
};

export function GamepadArtwork({
  systemId = "snes",
  buttonStates = {},
  buttonValues = {},
  axisValues = [],
  highlightedButton,
  className,
  onButtonSelect,
}: GamepadArtworkProps) {
  const system = retroSystem(systemId);
  const label = (id: number) => system.controls.find((control) => control.id === id)?.label;
  return (
    <div className={className}>
      <span
        className="sr-only"
        role="img"
        aria-label={`${system.hardware}, live control display`}
      />
      <div style={{ width: "100%", aspectRatio: "1.5", minHeight: 220 }}>
        <SceneBoundary key={systemId}>
          <Suspense fallback={<GamepadSceneStatus />}>
            <GamepadScene
              assetUrl={retroAssets[systemId]}
              buttonStates={buttonStates}
              buttonValues={buttonValues}
              axisValues={axisValues}
              highlightedButton={highlightedButton}
              onButtonSelect={onButtonSelect}
            />
          </Suspense>
        </SceneBoundary>
      </div>
      <div className="sr-only">
        {system.controls
          .filter(({ id }) => buttonStates[id])
          .map(({ id, label: name }) => (
            <span key={id} aria-label={`${name} pressed`}>
              {name} pressed.{" "}
            </span>
          ))}
        {highlightedButton != null && label(highlightedButton) && (
          <span>{label(highlightedButton)} selected for mapping. </span>
        )}
        {system.sticks.map((name, stick) => (
          <span key={name}>
            {name}: {(axisValues[stick * 2] ?? 0).toFixed(2)},{" "}
            {(axisValues[stick * 2 + 1] ?? 0).toFixed(2)}.{" "}
          </span>
        ))}
      </div>
    </div>
  );
}
