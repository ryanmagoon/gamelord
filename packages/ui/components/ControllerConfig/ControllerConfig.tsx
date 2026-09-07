import {
  GamepadArtwork,
  GamepadGlyph,
  detectGamepadModel,
  physicalButtonLabel,
  type GamepadModel,
} from "../GamepadArtwork/GamepadArtwork";
import React, { useEffect } from "react";
import { Gamepad2, RotateCcw, Usb, Unplug, CircleDot } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../utils";
import {
  type ConnectedController,
  type ControllerMapping,
  type ButtonBinding,
  getButtonLabel,
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
        isSelected ? "bg-accent ring-1 ring-accent-foreground/10" : "hover:bg-accent/50",
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
  model: GamepadModel;
  isRemapping: boolean;
  isPressed: boolean;
  onStartRemap: () => void;
}> = ({ binding, controllerType, model, isRemapping, isPressed, onStartRemap }) => {
  const displayLabel = getButtonLabel(binding.retroId, controllerType);
  const boundTo =
    binding.gamepadButtonIndex !== null
      ? physicalButtonLabel(binding.gamepadButtonIndex, model)
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
          "text-xs px-2 py-0.5 rounded inline-flex items-center gap-2",
          isRemapping
            ? "bg-primary text-primary-foreground animate-pulse"
            : binding.gamepadButtonIndex !== null
              ? "bg-muted text-muted-foreground"
              : "bg-destructive/10 text-destructive",
        )}
      >
        {!isRemapping && binding.gamepadButtonIndex !== null && (
          <GamepadGlyph button={binding.gamepadButtonIndex} model={model} />
        )}
        {isRemapping ? "Press a button…" : boundTo}
      </span>
    </button>
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
    <div className="space-y-5" data-controller-capture={remappingButton !== null}>
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
          <GamepadArtwork
            controllerId={selectedController.id}
            buttonStates={buttonStates}
            axisValues={axisValues}
            highlightedButton={
              mapping.bindings.find((b) => b.retroId === remappingButton)?.gamepadButtonIndex
            }
          />
          <p className="text-xs text-muted-foreground text-center">
            Press buttons or move the sticks to test your controller.
          </p>
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
            <span>Release all buttons, then press a button to bind. Home or Escape cancels.</span>
            <Button variant="ghost" onClick={onCancelRemap}>
              Cancel
            </Button>
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
                model={detectGamepadModel(selectedController?.id ?? "")}
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
