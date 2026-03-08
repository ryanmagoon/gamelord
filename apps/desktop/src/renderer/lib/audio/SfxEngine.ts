/**
 * Singleton sound effects engine.
 *
 * Manages a dedicated AudioContext (separate from the emulation audio),
 * pre-renders all UI sounds into AudioBuffers at startup, and exposes
 * a fire-and-forget `play()` method.
 *
 * The AudioContext is created eagerly during app load (before the user
 * interacts) so the ~500ms OS audio subsystem init doesn't block any
 * UI interaction. The context starts suspended per autoplay policy and
 * is resumed on the first `play()` call.
 *
 * Preferences (enabled, volume) are persisted to localStorage and
 * exposed via a subscribe/getSnapshot pattern for useSyncExternalStore.
 */
import { soundGenerators } from "./sounds";

export type SfxId = keyof typeof soundGenerators;

export interface SfxPreferences {
  enabled: boolean;
  /** Volume scalar in [0, 1]. */
  volume: number;
}

type Listener = () => void;

const STORAGE_KEY_ENABLED = "gamelord:sfx-enabled";
const STORAGE_KEY_VOLUME = "gamelord:sfx-volume";

class SfxEngine {
  private readonly ctx: AudioContext;
  private readonly gainNode: GainNode;
  private readonly buffers = new Map<SfxId, AudioBuffer>();
  private preferences: SfxPreferences;
  private listeners = new Set<Listener>();

  constructor() {
    const storedEnabled = localStorage.getItem(STORAGE_KEY_ENABLED);
    const storedVolume = localStorage.getItem(STORAGE_KEY_VOLUME);
    this.preferences = {
      enabled: storedEnabled !== "false", // default true
      volume: storedVolume !== null ? Number.parseFloat(storedVolume) : 0.5,
    };

    // Initialize everything at startup. `new AudioContext()` takes ~500ms in
    // Electron (OS audio subsystem init), but this runs during app load when
    // the user isn't interacting, so there's nothing to hitch. The context
    // starts suspended (autoplay policy) and is resumed on first play().
    this.ctx = new AudioContext();
    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = this.preferences.volume;
    this.gainNode.connect(this.ctx.destination);

    for (const [id, generator] of Object.entries(soundGenerators)) {
      this.buffers.set(id as SfxId, generator(this.ctx));
    }
  }

  /** Fire-and-forget sound playback. No-op when disabled. */
  play(id: SfxId): void {
    if (!this.preferences.enabled) {
      return;
    }

    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }

    const buffer = this.buffers.get(id);
    if (!buffer) {
      return;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode);
    source.start(0);
  }

  /**
   * Return the current preferences object.
   *
   * This returns the same reference until a preference changes (setEnabled/
   * setVolume replace the object), which is required for useSyncExternalStore
   * to avoid infinite re-render loops via Object.is comparison.
   */
  getPreferences(): SfxPreferences {
    return this.preferences;
  }

  setEnabled(enabled: boolean): void {
    this.preferences = { ...this.preferences, enabled };
    localStorage.setItem(STORAGE_KEY_ENABLED, String(enabled));
    this.notify();
  }

  setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.preferences = { ...this.preferences, volume: clamped };
    localStorage.setItem(STORAGE_KEY_VOLUME, String(clamped));
    this.gainNode.gain.value = clamped;
    this.notify();
  }

  /** Subscribe for preference changes (useSyncExternalStore compatible). */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const sfxEngine = new SfxEngine();
