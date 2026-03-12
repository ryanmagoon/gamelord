import React from "react";
import { DPadCluster } from "./DPadCluster";
import { KeyBadge } from "./KeyBadge";
import { getControllerLayout, KEYBOARD_KEYS } from "./controller-layouts";

interface ControllerDiagramProps {
  systemId?: string;
  className?: string;
}

/** Human-readable button labels for each face button. */
const BUTTON_LABELS: Record<string, string> = {
  a: "A",
  b: "B",
  x: "X",
  y: "Y",
};

export function ControllerDiagram({ systemId, className }: ControllerDiagramProps) {
  const layout = getControllerLayout(systemId);
  const { faceButtons, hasShoulders, hasSelect } = layout;

  return (
    <div className={`flex flex-col items-center gap-5 ${className ?? ""}`}>
      {/* Shoulder buttons */}
      {hasShoulders && (
        <div className="flex items-center justify-between w-full max-w-xs" data-row="shoulders">
          <div data-button-id="l">
            <KeyBadge label="L">{KEYBOARD_KEYS.l}</KeyBadge>
          </div>
          <div data-button-id="r">
            <KeyBadge label="R">{KEYBOARD_KEYS.r}</KeyBadge>
          </div>
        </div>
      )}

      {/* Main row: D-pad + Face buttons */}
      <div className="flex items-center justify-between w-full max-w-xs">
        {/* D-pad */}
        <div data-button-id="dpad">
          <DPadCluster />
        </div>

        {/* Face buttons */}
        <div className="flex items-center gap-2">
          {faceButtons.map((id) => (
            <div key={id} data-button-id={id}>
              <KeyBadge label={BUTTON_LABELS[id]}>{KEYBOARD_KEYS[id]}</KeyBadge>
            </div>
          ))}
        </div>
      </div>

      {/* Center buttons: Select + Start */}
      <div className="flex items-center justify-center gap-4">
        {hasSelect && (
          <div data-button-id="select">
            <KeyBadge label="Select">{KEYBOARD_KEYS.select}</KeyBadge>
          </div>
        )}
        <div data-button-id="start">
          <KeyBadge label="Start">{KEYBOARD_KEYS.start}</KeyBadge>
        </div>
      </div>
    </div>
  );
}
