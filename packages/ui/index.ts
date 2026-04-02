// Components
export * from "./components/ui/alert-dialog";
export * from "./components/ui/button";
export * from "./components/ui/card";
export * from "./components/ui/badge";
export * from "./components/ui/dialog";
export * from "./components/ui/input";
export * from "./components/ui/select";
export * from "./components/ui/dropdown-menu";
export * from "./components/ui/switch";

export * from "./components/ControllerConfig";
export * from "./components/ControlsOverlay";
export * from "./components/CheatPanel";
export * from "./components/DiscSwapOverlay";
export * from "./components/CoreDownloadBanner";
export * from "./components/UpdateNotification";
export * from "./components/GameCard";
export * from "./components/CommandPalette";
export * from "./components/GameLibrary";
export * from "./components/ScrollLetterIndicator";
export * from "./components/GameDetails";
export * from "./components/ResumeGameDialog";
export * from "./components/SystemDisambiguationDialog";
export * from "./components/TVStatic";
export * from "./components/PlatformIcon";
export * from "./components/WebGLRenderer";
export { WebGLRenderer, SHADER_PRESETS, SHADER_LABELS } from "./webgl/WebGLRenderer";
export type { WebGLRendererOptions } from "./webgl/WebGLRenderer";
export { detectHdrCapabilities, isHdrCapable } from "./webgl/hdrCapabilities";
export type { HdrCapabilities } from "./webgl/hdrCapabilities";
export type { ShaderPresetDefinition } from "./webgl/types";

// Hooks
export { useFlipAnimation } from "./hooks/useFlipAnimation";
export type {
  FlipItem,
  FlipAnimationState,
  UseFlipAnimationOptions,
} from "./hooks/useFlipAnimation";
export { ArtworkSyncStore, useArtworkSyncPhase } from "./hooks/useArtworkSyncStore";
export {
  useEdgeAwareHover,
  computeEdgeTranslate,
  findScrollContainer,
} from "./hooks/useEdgeAwareHover";
export type { UseEdgeAwareHoverOptions, UseEdgeAwareHoverResult } from "./hooks/useEdgeAwareHover";

// Platform
export { isMacPlatform, modifierKey } from "./hooks/usePlatform";

// Utils
export * from "./utils";
