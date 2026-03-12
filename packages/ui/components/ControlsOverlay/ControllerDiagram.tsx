import React from "react";
import { DPadCluster } from "./DPadCluster";
import { KeyBadge } from "./KeyBadge";
import { type ControlButtonId, getControllerLayout, KEYBOARD_KEYS } from "./controller-layouts";

interface ControllerDiagramProps {
  systemId?: string;
  className?: string;
}

/** Human-readable button labels for display beneath each key badge. */
const BUTTON_LABELS: Record<Exclude<ControlButtonId, "dpad">, string> = {
  a: "A",
  b: "B",
  x: "X",
  y: "Y",
  l: "L",
  r: "R",
  select: "Select",
  start: "Start",
};

export function ControllerDiagram({ systemId, className }: ControllerDiagramProps) {
  const layout = getControllerLayout(systemId);
  const { viewBox, silhouettePath, buttons, dpadCenter } = layout;

  const buttonEntries = Object.entries(buttons) as Array<
    [Exclude<ControlButtonId, "dpad">, { top: number; left: number }]
  >;

  return (
    <div
      className={`relative w-full ${className ?? ""}`}
      style={{ aspectRatio: `${viewBox.width} / ${viewBox.height}` }}
    >
      {/* SVG silhouette */}
      <svg
        viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
        className="absolute inset-0 w-full h-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d={silhouettePath}
          stroke="white"
          strokeOpacity={0.12}
          strokeWidth={1.5}
          strokeLinejoin="round"
          fill="white"
          fillOpacity={0.02}
        />
      </svg>

      {/* D-pad cluster */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ top: `${dpadCenter.top}%`, left: `${dpadCenter.left}%` }}
        data-button-id="dpad"
      >
        <DPadCluster />
      </div>

      {/* Button badges */}
      {buttonEntries.map(([id, pos]) => (
        <div
          key={id}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ top: `${pos.top}%`, left: `${pos.left}%` }}
          data-button-id={id}
        >
          <KeyBadge label={BUTTON_LABELS[id]}>{KEYBOARD_KEYS[id]}</KeyBadge>
        </div>
      ))}
    </div>
  );
}
