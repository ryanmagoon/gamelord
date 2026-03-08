import React, { useState, useEffect, useRef, useCallback } from "react";
import { Gamepad2, RotateCcw, Usb, Unplug, CircleDot } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../utils";
import {
  type ConnectedController,
  type ControllerMapping,
  type ButtonBinding,
  getButtonLabel,
  getGamepadButtonLabel,
  getDefaultMapping,
} from "./controller-mappings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ControllerConfigProps {
  /** Connected controllers to display. Empty array = no controllers. */
  controllers: Array<ConnectedController>;
  /** Current mapping for the selected controller. */
  mapping: ControllerMapping;
  /** Called when a button binding is changed via the remap flow. */
  onBindingChange: (retroId: number, gamepadButtonIndex: number | null) => void;
  /** Called when the user clicks "Reset to Defaults". */
  onResetDefaults: () => void;
  /** Index of the currently selected controller (for multi-controller). */
  selectedControllerIndex: number;
  /** Called when the user selects a different controller. */
  onSelectController: (index: number) => void;
  /**
   * Live button states for the button tester.
   * Keys are W3C gamepad button indices, values are pressed state.
   */
  buttonStates: Record<number, boolean>;
  /**
   * Live axis values for the button tester.
   * Array of axis values [-1, 1].
   */
  axisValues: Array<number>;
  /** The retroId currently being remapped (null = not remapping). */
  remappingButton: number | null;
  /** Called when the user clicks a binding row to start remapping. */
  onStartRemap: (retroId: number) => void;
  /** Called to cancel an in-progress remap. */
  onCancelRemap: () => void;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const SectionHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-sm font-semibold text-foreground mb-3">{children}</h3>
);

/** Connected controller status card. */
const ControllerCard: React.FC<{
  controller: ConnectedController;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ controller, isSelected, onSelect }) => {
  const typeLabel =
    controller.type === "xbox"
      ? "Xbox"
      : controller.type === "playstation"
        ? "PlayStation"
        : "Generic";

  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left transition-all duration-150",
        isSelected
          ? "bg-accent ring-1 ring-accent-foreground/10"
          : "hover:bg-accent/50",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center h-8 w-8 rounded-md",
          controller.connected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        <Gamepad2 className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{controller.name}</div>
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <span>{typeLabel}</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="flex items-center gap-1">
            {controller.connected ? (
              <>
                <Usb className="h-3 w-3 text-green-500" />
                <span className="text-green-500">Connected</span>
              </>
            ) : (
              <>
                <Unplug className="h-3 w-3" />
                <span>Disconnected</span>
              </>
            )}
          </span>
        </div>
      </div>
    </button>
  );
};

/** Single binding row in the mapping table. */
const BindingRow: React.FC<{
  binding: ButtonBinding;
  controllerType: ConnectedController["type"];
  isRemapping: boolean;
  isPressed: boolean;
  onStartRemap: () => void;
}> = ({ binding, controllerType, isRemapping, isPressed, onStartRemap }) => {
  const displayLabel = getButtonLabel(binding.retroId, controllerType);
  const boundTo =
    binding.gamepadButtonIndex !== null
      ? getGamepadButtonLabel(binding.gamepadButtonIndex)
      : "Unbound";

  return (
    <button
      onClick={onStartRemap}
      className={cn(
        "flex items-center justify-between w-full py-2 px-3 rounded-md text-sm transition-all duration-150",
        isRemapping
          ? "bg-primary/10 ring-1 ring-primary/30"
          : isPressed
            ? "bg-accent"
            : "hover:bg-accent/50",
      )}
    >
      <span className="font-medium">{displayLabel}</span>
      <span
        className={cn(
          "text-xs px-2 py-0.5 rounded",
          isRemapping
            ? "bg-primary text-primary-foreground animate-pulse"
            : binding.gamepadButtonIndex !== null
              ? "bg-muted text-muted-foreground"
              : "bg-destructive/10 text-destructive",
        )}
      >
        {isRemapping ? "Press a button…" : boundTo}
      </span>
    </button>
  );
};

/** Single button indicator in the tester. */
const BtnPill: React.FC<{ label: string; pressed: boolean; className?: string }> = ({
  label,
  pressed,
  className,
}) => (
  <div
    className={cn(
      "flex items-center justify-center rounded text-[10px] font-medium h-7 w-9 transition-all duration-75",
      pressed ? "bg-primary text-primary-foreground scale-95" : "bg-muted/50 text-muted-foreground",
      className,
    )}
  >
    {label}
  </div>
);

/** D-pad rendered as a cross pattern. */
const DPadCluster: React.FC<{ buttonStates: Record<number, boolean> }> = ({ buttonStates }) => (
  <div className="grid grid-cols-3 grid-rows-3 gap-0.5 w-[118px]">
    <div />
    <BtnPill label="Up" pressed={Boolean(buttonStates[12])} />
    <div />
    <BtnPill label="Left" pressed={Boolean(buttonStates[14])} />
    <div />
    <BtnPill label="Right" pressed={Boolean(buttonStates[15])} />
    <div />
    <BtnPill label="Down" pressed={Boolean(buttonStates[13])} />
    <div />
  </div>
);

/** Face buttons rendered as a diamond pattern. */
const FaceButtonCluster: React.FC<{ buttonStates: Record<number, boolean> }> = ({
  buttonStates,
}) => (
  <div className="grid grid-cols-3 grid-rows-3 gap-0.5 w-[118px]">
    <div />
    <BtnPill label="Y" pressed={Boolean(buttonStates[3])} />
    <div />
    <BtnPill label="X" pressed={Boolean(buttonStates[2])} />
    <div />
    <BtnPill label="B" pressed={Boolean(buttonStates[1])} />
    <div />
    <BtnPill label="A" pressed={Boolean(buttonStates[0])} />
    <div />
  </div>
);

/** Live button tester showing pressed state in a spatial controller layout. */
const ButtonTester: React.FC<{
  buttonStates: Record<number, boolean>;
  axisValues: Array<number>;
}> = ({ buttonStates, axisValues }) => {
  const hasInput =
    Object.values(buttonStates).some(Boolean) || axisValues.some((v) => Math.abs(v) > 0.1);

  return (
    <div className="space-y-2">
      {/* Shoulders: LB / LT ... RT / RB */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <BtnPill label="LB" pressed={Boolean(buttonStates[4])} />
          <BtnPill label="LT" pressed={Boolean(buttonStates[6])} />
        </div>
        <div className="flex gap-1">
          <BtnPill label="RT" pressed={Boolean(buttonStates[7])} />
          <BtnPill label="RB" pressed={Boolean(buttonStates[5])} />
        </div>
      </div>

      {/* Center row: Back / Start with L3 / R3 */}
      <div className="flex items-center justify-center gap-2">
        <BtnPill label="Back" pressed={Boolean(buttonStates[8])} className="w-11" />
        <BtnPill label="L3" pressed={Boolean(buttonStates[10])} />
        <BtnPill label="R3" pressed={Boolean(buttonStates[11])} />
        <BtnPill label="Start" pressed={Boolean(buttonStates[9])} className="w-11" />
      </div>

      {/* Main row: D-pad + sticks + face buttons */}
      <div className="flex items-center justify-between">
        <DPadCluster buttonStates={buttonStates} />

        {/* Analog sticks between clusters */}
        {axisValues.length >= 2 && (
          <div className="flex items-center gap-3">
            <AnalogStickVisualization
              label="Left Stick"
              x={axisValues[0] ?? 0}
              y={axisValues[1] ?? 0}
            />
            {axisValues.length >= 4 && (
              <AnalogStickVisualization
                label="Right Stick"
                x={axisValues[2] ?? 0}
                y={axisValues[3] ?? 0}
              />
            )}
          </div>
        )}

        <FaceButtonCluster buttonStates={buttonStates} />
      </div>

      {/* Hint — always rendered, fades out to avoid layout shift */}
      <p
        className={cn(
          "text-xs text-muted-foreground text-center py-1 transition-opacity duration-150",
          hasInput ? "opacity-0" : "opacity-100",
        )}
      >
        Press buttons to test your controller
      </p>
    </div>
  );
};

/** Visual representation of an analog stick position. */
const AnalogStickVisualization: React.FC<{
  label: string;
  x: number;
  y: number;
}> = ({ label, x, y }) => {
  const SIZE = 48;
  const HALF = SIZE / 2;
  const DOT_RADIUS = 4;
  const dotX = HALF + x * (HALF - DOT_RADIUS);
  const dotY = HALF + y * (HALF - DOT_RADIUS);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative rounded-full bg-muted/50 border border-border/50"
        style={{ width: SIZE, height: SIZE }}
      >
        {/* Center crosshair */}
        <div className="absolute top-1/2 left-0 right-0 h-px bg-border/30" />
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border/30" />
        {/* Dot */}
        <div
          className={cn(
            "absolute rounded-full transition-all duration-75",
            Math.abs(x) > 0.1 || Math.abs(y) > 0.1 ? "bg-primary" : "bg-muted-foreground/50",
          )}
          style={{
            width: DOT_RADIUS * 2,
            height: DOT_RADIUS * 2,
            left: dotX - DOT_RADIUS,
            top: dotY - DOT_RADIUS,
          }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const ControllerConfig: React.FC<ControllerConfigProps> = ({
  controllers,
  mapping,
  onBindingChange,
  onResetDefaults,
  selectedControllerIndex,
  onSelectController,
  buttonStates,
  axisValues,
  remappingButton,
  onStartRemap,
  onCancelRemap,
}) => {
  const selectedController = controllers[selectedControllerIndex];

  // Handle escape to cancel remap
  useEffect(() => {
    if (remappingButton === null) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancelRemap();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [remappingButton, onCancelRemap]);

  if (controllers.length === 0) {
    return <NoControllersView />;
  }

  const controllerType = selectedController?.type ?? "generic";

  return (
    <div className="space-y-5">
      {/* Controller selector (for multiple controllers) */}
      <div>
        <SectionHeading>Controllers</SectionHeading>
        <div className="space-y-1">
          {controllers.map((controller, index) => (
            <ControllerCard
              key={controller.index}
              controller={controller}
              isSelected={index === selectedControllerIndex}
              onSelect={() => onSelectController(index)}
            />
          ))}
        </div>
      </div>

      {/* Button tester */}
      {selectedController?.connected && (
        <div>
          <SectionHeading>Button Tester</SectionHeading>
          <ButtonTester buttonStates={buttonStates} axisValues={axisValues} />
        </div>
      )}

      {/* Button mappings */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <SectionHeading>Button Mapping</SectionHeading>
          <Button
            variant="outline"
            size="sm"
            onClick={onResetDefaults}
            className="h-7 text-xs gap-1.5"
          >
            <RotateCcw className="h-3 w-3" />
            Reset to Defaults
          </Button>
        </div>

        {remappingButton !== null && (
          <div className="mb-3 flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
            <CircleDot className="h-4 w-4 animate-pulse" />
            <span>Press the button you want to bind, or Escape to cancel</span>
          </div>
        )}

        <div className="space-y-0.5">
          {mapping.bindings.map((binding) => {
            const isPressed =
              binding.gamepadButtonIndex !== null &&
              Boolean(buttonStates[binding.gamepadButtonIndex]);
            return (
              <BindingRow
                key={binding.retroId}
                binding={binding}
                controllerType={controllerType}
                isRemapping={remappingButton === binding.retroId}
                isPressed={isPressed}
                onStartRemap={() => onStartRemap(binding.retroId)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

/** Shown when no controllers are connected. */
const NoControllersView: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <div className="flex items-center justify-center h-12 w-12 rounded-full bg-muted mb-4">
      <Gamepad2 className="h-6 w-6 text-muted-foreground" />
    </div>
    <h3 className="text-sm font-semibold mb-1">No Controllers Detected</h3>
    <p className="text-xs text-muted-foreground max-w-xs">
      Connect a controller to configure button mappings. GameLord supports Xbox, PlayStation, and
      any standard gamepad.
    </p>
  </div>
);
