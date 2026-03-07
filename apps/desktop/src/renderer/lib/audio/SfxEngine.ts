/**
 * Singleton sound effects engine.
 *
 * Manages a dedicated AudioContext (separate from the emulation audio),
 * pre-renders all UI sounds into AudioBuffers eagerly (via OfflineAudioContext,
 * which needs no user gesture), and exposes a fire-and-forget `play()` method.
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

/** Sample rate used for offline pre-rendering and playback. */
const SAMPLE_RATE = 44_100;

class SfxEngine {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private buffers = new Map<SfxId, AudioBuffer>();
  private preferences: SfxPreferences;
  private listeners = new Set<Listener>();
  private initialized = false;

  constructor() {
    const storedEnabled = localStorage.getItem(STORAGE_KEY_ENABLED);
    const storedVolume = localStorage.getItem(STORAGE_KEY_VOLUME);
    this.preferences = {
      enabled: storedEnabled !== "false", // default true
      volume: storedVolume !== null ? Number.parseFloat(storedVolume) : 0.5,
    };

    this.preRenderBuffers();
  }

  /**
   * Pre-render all sound buffers using OfflineAudioContext.
   *
   * OfflineAudioContext doesn't connect to audio hardware, doesn't require
   * a user gesture, and doesn't block the main thread significantly since
   * our generators are pure math (~2ms total for all 17 sounds).
   * The resulting AudioBuffers are reusable with the real AudioContext.
   */
  private preRenderBuffers(): void {
    const offlineCtx = new OfflineAudioContext(1, 1, SAMPLE_RATE);
    for (const [id, generator] of Object.entries(soundGenerators)) {
      this.buffers.set(id as SfxId, generator(offlineCtx));
    }
  }

  /**
   * Lazily initialize the real AudioContext and audio graph.
   * Called on first play()/warmup() — must be inside a user gesture.
   */
  private ensureContext(): void {
    if (this.initialized) {
      return;
    }

    this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = this.preferences.volume;
    this.gainNode.connect(this.ctx.destination);

    this.initialized = true;
  }

  /**
   * Pre-initialize AudioContext on the first user gesture (click/keydown).
   */
  warmup(): void {
    this.ensureContext();
  }

  /** Fire-and-forget sound playback. No-op when disabled. */
  play(id: SfxId): void {
    if (!this.preferences.enabled) {
      return;
    }
    this.ensureContext();

    const ctx = this.ctx;
    const gainNode = this.gainNode;
    if (!ctx || !gainNode) {
      return;
    }

    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    const buffer = this.buffers.get(id);
    if (!buffer) {
      return;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gainNode);
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
    if (this.gainNode) {
      this.gainNode.gain.value = clamped;
    }
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
