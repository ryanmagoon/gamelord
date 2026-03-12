import React from "react";
import { DPadCluster } from "./DPadCluster";
import { KeyBadge } from "./KeyBadge";
import { type KeyboardBinding, formatKeyLabel, isDPadBinding } from "./controller-layouts";

interface ControllerDiagramProps {
  /** All keyboard bindings to display. */
  bindings: ReadonlyArray<KeyboardBinding>;
  className?: string;
}

export function ControllerDiagram({ bindings, className }: ControllerDiagramProps) {
  const dpadBindings = bindings.filter(isDPadBinding);
  const buttonBindings = bindings.filter((b) => !isDPadBinding(b));

  return (
    <div className={`flex flex-col items-center gap-5 ${className ?? ""}`}>
      {/* Main row: D-pad + button bindings */}
      <div className="flex items-start justify-between w-full gap-6">
        {/* D-pad cluster (if any d-pad bindings exist) */}
        {dpadBindings.length > 0 && (
          <div data-testid="dpad-cluster">
            <DPadCluster />
          </div>
        )}

        {/* Button bindings in a grid */}
        {buttonBindings.length > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-3">
            {buttonBindings.map((binding) => (
              <div key={binding.label} data-testid={`binding-${binding.label}`}>
                <KeyBadge label={binding.label}>{formatKeyLabel(binding.key)}</KeyBadge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
