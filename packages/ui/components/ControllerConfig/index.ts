export { ControllerConfig } from "./ControllerConfig";
export type { ControllerConfigProps } from "./ControllerConfig";
export {
  type ControllerType,
  type ConnectedController,
  type ControllerMapping,
  type ButtonBinding,
  detectControllerType,
  getControllerDisplayName,
  getButtonLabel,
  getGamepadButtonLabel,
  getDefaultMapping,
  loadMapping,
  saveMapping,
  clearMapping,
  mappingToArray,
  BUTTON_ORDER,
} from "./controller-mappings";
