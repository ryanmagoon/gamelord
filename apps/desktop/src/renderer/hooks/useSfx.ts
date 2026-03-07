import { useCallback, useSyncExternalStore } from "react";
import { sfxEngine, type SfxId, type SfxPreferences } from "../lib/audio/SfxEngine";

export type { SfxId, SfxPreferences };

export interface UseSfxResult {
  /** Fire-and-forget sound playback. */
  play: (id: SfxId) => void;
  /** Current preferences (enabled, volume). */
  preferences: SfxPreferences;
  /** Toggle SFX on/off. */
  setEnabled: (enabled: boolean) => void;
  /** Set SFX volume (0..1). */
  setVolume: (volume: number) => void;
}

const subscribe = (cb: () => void) => sfxEngine.subscribe(cb);
const getSnapshot = () => sfxEngine.getPreferences();

export function useSfx(): UseSfxResult {
  const preferences = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const play = useCallback((id: SfxId) => sfxEngine.play(id), []);
  const setEnabled = useCallback((v: boolean) => sfxEngine.setEnabled(v), []);
  const setVolume = useCallback((v: number) => sfxEngine.setVolume(v), []);

  return { play, preferences, setEnabled, setVolume };
}
