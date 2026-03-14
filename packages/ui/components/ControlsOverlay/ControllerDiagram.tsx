import React from "react";
import { DPadCluster } from "./DPadCluster";
import { KeyBadge } from "./KeyBadge";
import {
  type KeyboardBinding,
  formatKeyLabel,
  isCenterBinding,
  isDPadBinding,
  isFaceBinding,
  isShoulderBinding,
} from "./controller-layouts";

interface ControllerDiagramProps {
  /** All keyboard bindings to display. */
  bindings: ReadonlyArray<KeyboardBinding>;
  className?: string;
}

/**
 * Renders keyboard bindings in a spatial layout that mirrors a controller:
 * - Shoulders row: L and R spread apart across the top
 * - Main row: D-pad on the left, face buttons on the right
 * - Center row: Select and Start centered below
 */
export function ControllerDiagram({ bindings, className }: ControllerDiagramProps) {
  const shoulders = bindings.filter(isShoulderBinding);
  const dpad = bindings.filter(isDPadBinding);
  const face = bindings.filter(isFaceBinding);
  const center = bindings.filter(isCenterBinding);

  const hasShoulders = shoulders.length > 0;
  const hasDpad = dpad.length > 0;
  const hasFace = face.length > 0;
  const hasCenter = center.length > 0;

  return (
    <div className={`flex flex-col items-center gap-4 ${className ?? ""}`}>
      {/* Shoulders row */}
      {hasShoulders && (
        <div className="flex w-full justify-between px-4" data-testid="shoulders-row">
          {shoulders.map((binding) => (
            <div key={binding.label} data-testid={`binding-${binding.label}`}>
              <KeyBadge label={binding.label}>{formatKeyLabel(binding.key)}</KeyBadge>
            </div>
          ))}
        </div>
      )}

      {/* Main row: D-pad left, face buttons right */}
      {(hasDpad || hasFace) && (
        <div className="flex items-center justify-between w-full gap-6" data-testid="main-row">
          {hasDpad ? (
            <div data-testid="dpad-cluster">
              <DPadCluster />
            </div>
          ) : (
            <div />
          )}

          {hasFace && (
            <div
              className="flex flex-wrap items-center justify-end gap-3"
              data-testid="face-buttons"
            >
              {face.map((binding) => (
                <div key={binding.label} data-testid={`binding-${binding.label}`}>
                  <KeyBadge label={binding.label}>{formatKeyLabel(binding.key)}</KeyBadge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Center row: Select, Start */}
      {hasCenter && (
        <div className="flex items-center justify-center gap-4" data-testid="center-row">
          {center.map((binding) => (
            <div key={binding.label} data-testid={`binding-${binding.label}`}>
              <KeyBadge label={binding.label}>{formatKeyLabel(binding.key)}</KeyBadge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
