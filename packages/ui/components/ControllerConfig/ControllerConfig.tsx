import {
  GamepadArtwork,
  GamepadGlyph,
  detectGamepadModel,
  physicalButtonLabel,
  type GamepadModel,
} from "../GamepadArtwork/GamepadArtwork";
import React, { useEffect, useState } from "react";
import {
  RETRO_SYSTEMS,
  retroSystem,
  mappedRetroInput,
  type RetroSystemId,
} from "../GamepadArtwork/retroSystems";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Gamepad2, RotateCcw, Usb, Unplug, CircleDot } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../utils";
import {
  type ConnectedController,
  type ControllerMapping,
  type ButtonBinding,
} from "./controller-mappings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ControllerConfigProps {
  systemId?: RetroSystemId;
  onSelectSystem?: (systemId: RetroSystemId) => void;
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
  buttonValues?: Record<number, number>;
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
        : detectGamepadModel(controller.id) === "switch"
          ? "Nintendo"
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
  disabled?: boolean;
  model: GamepadModel;
  isRemapping: boolean;
  isPressed: boolean;
  onStartRemap: () => void;
}> = ({ binding, disabled, model, isRemapping, isPressed, onStartRemap }) => {
  const displayLabel = binding.label;
  const boundTo =
    binding.gamepadButtonIndex !== null
      ? physicalButtonLabel(binding.gamepadButtonIndex, model)
      : "Unbound";

  return (
    <button
      onClick={onStartRemap}
      disabled={disabled}
      aria-label={`Map ${displayLabel}`}
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
  systemId = "snes",
  onSelectSystem,
  controllers,
  mapping,
  onResetDefaults,
  selectedControllerIndex,
  onSelectController,
  buttonStates,
  buttonValues,
  axisValues,
  remappingButton,
  onStartRemap,
  onCancelRemap,
}) => {
  const selectedController = controllers[selectedControllerIndex];
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setTesting(false);
  }, [systemId, selectedController?.id, selectedController?.index, selectedController?.connected]);

  useEffect(() => {
    if (buttonStates[16]) {
      setTesting(false);
    }
  }, [buttonStates]);

  // Escape leaves input capture without also dismissing the surrounding dialog.
  useEffect(() => {
    if (remappingButton === null && !testing) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setTesting(false);
        if (remappingButton !== null) {
          onCancelRemap();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [remappingButton, onCancelRemap, testing]);

  const startRemap = (retroId: number) => {
    setTesting(false);
    onStartRemap(retroId);
  };

  const system = retroSystem(systemId);
  const input = mappedRetroInput(mapping, buttonStates, buttonValues ?? {}, axisValues, systemId);
  const model = detectGamepadModel(selectedController?.id ?? "");
  const bindings = system.controls.map(({ id, label }) => ({
    retroId: id,
    label,
    gamepadButtonIndex:
      mapping.bindings.find((binding) => binding.retroId === id)?.gamepadButtonIndex ?? null,
  }));

  return (
    <div
      className="@container space-y-5"
      data-controller-capture={remappingButton !== null || testing}
    >
      <div className="grid gap-5 @[620px]:grid-cols-2">
        <div>
          <SectionHeading>System</SectionHeading>
          <Select
            value={systemId}
            onValueChange={(value) => onSelectSystem?.(value as RetroSystemId)}
          >
            <SelectTrigger aria-label="Emulated system">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RETRO_SYSTEMS.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Controller selector (for multiple controllers) */}
        <div>
          <SectionHeading>Input Controller</SectionHeading>
          {controllers.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Connect a controller to test and assign controls.
            </p>
          )}
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
      </div>
      <div className="grid items-start gap-5 @[620px]:grid-cols-[minmax(0,1fr)_minmax(240px,0.8fr)]">
        <div className="rounded-xl border bg-muted/20 p-3 @[620px]:sticky @[620px]:top-0">
          <p className="text-center text-xs font-medium text-muted-foreground">{system.hardware}</p>
          <GamepadArtwork
            systemId={systemId}
            buttonStates={input.buttonStates}
            buttonValues={input.buttonValues}
            axisValues={input.axisValues}
            onButtonSelect={selectedController?.connected ? startRemap : undefined}
            highlightedButton={
              systemId === "gamecube" && remappingButton !== null && remappingButton >= 14
                ? remappingButton - 2
                : remappingButton
            }
          />
          {selectedController?.connected && (
            <div className="flex justify-center mb-2">
              <Button
                variant="outline"
                size="sm"
                disabled={remappingButton !== null}
                onClick={() => setTesting((current) => !current)}
              >
                {testing ? "Stop testing" : "Test controls"}
              </Button>
            </div>
          )}
          <p
            className="text-xs text-muted-foreground text-center"
            role={testing ? "status" : undefined}
          >
            {selectedController?.connected
              ? testing
                ? "Press buttons or move sticks. Home or Escape ends testing."
                : "Select a control to assign it, or test your current mappings."
              : "Connect a controller to bring these controls to life."}
          </p>
        </div>

        {/* Button mappings */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <SectionHeading>Button Mapping</SectionHeading>
            <Button
              variant="outline"
              size="sm"
              onClick={onResetDefaults}
              disabled={!selectedController?.connected}
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

          <div className="space-y-0.5 max-h-[380px] overflow-y-auto">
            {bindings.map((binding) => {
              const isPressed = Boolean(input.buttonStates[binding.retroId]);
              return (
                <BindingRow
                  key={binding.retroId}
                  binding={binding}
                  disabled={!selectedController?.connected}
                  model={model}
                  isRemapping={remappingButton === binding.retroId}
                  isPressed={isPressed}
                  onStartRemap={() => startRemap(binding.retroId)}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
