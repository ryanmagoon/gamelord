import { describe, it, expect, vi, beforeEach } from "vitest";

// We need to mock AudioContext and related APIs before importing SfxEngine,
// since the module creates a singleton on import.

function createMockAudioBuffer(): AudioBuffer {
  return {
    copyFromChannel: vi.fn(),
    copyToChannel: vi.fn(),
    duration: 0.1,
    getChannelData: () => new Float32Array(4410),
    length: 4410,
    numberOfChannels: 1,
    sampleRate: 44_100,
  } as unknown as AudioBuffer;
}

function createMockGainNode(): GainNode {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { value: 1 },
  } as unknown as GainNode;
}

function createMockSourceNode(): AudioBufferSourceNode {
  return {
    buffer: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  } as unknown as AudioBufferSourceNode;
}

let mockCtxState: AudioContextState = "running";
let mockResume: ReturnType<typeof vi.fn>;
let mockGainNode: GainNode;
let mockSourceNode: AudioBufferSourceNode;

function setupGlobalMocks() {
  mockCtxState = "running";
  mockResume = vi.fn(() => Promise.resolve());
  mockGainNode = createMockGainNode();
  mockSourceNode = createMockSourceNode();

  globalThis.AudioContext = vi.fn(function (this: Record<string, unknown>) {
    this.sampleRate = 44_100;
    this.destination = {};
    this.resume = mockResume;
    this.createGain = () => mockGainNode;
    this.createBuffer = () => createMockAudioBuffer();
    this.createBufferSource = () => mockSourceNode;
    Object.defineProperty(this, "state", {
      get() {
        return mockCtxState;
      },
    });
  }) as unknown as typeof AudioContext;
}

describe("SfxEngine", () => {
  beforeEach(() => {
    // Clear localStorage
    localStorage.clear();
    // Reset module registry so we get a fresh singleton each test
    vi.resetModules();
    setupGlobalMocks();
  });

  async function importFreshEngine() {
    const mod = await import("./SfxEngine");
    return mod.sfxEngine;
  }

  it("reads default preferences (enabled=true, volume=0.5)", async () => {
    const engine = await importFreshEngine();
    const prefs = engine.getPreferences();
    expect(prefs.enabled).toBe(true);
    expect(prefs.volume).toBe(0.5);
  });

  it("reads saved preferences from localStorage", async () => {
    localStorage.setItem("gamelord:sfx-enabled", "false");
    localStorage.setItem("gamelord:sfx-volume", "0.8");
    const engine = await importFreshEngine();
    const prefs = engine.getPreferences();
    expect(prefs.enabled).toBe(false);
    expect(prefs.volume).toBe(0.8);
  });

  it("does not create AudioContext until first play()", async () => {
    const engine = await importFreshEngine();
    expect(AudioContext).not.toHaveBeenCalled();
    engine.play("click");
    expect(AudioContext).toHaveBeenCalledTimes(1);
  });

  it("play() is a no-op when disabled", async () => {
    const engine = await importFreshEngine();
    engine.setEnabled(false);
    engine.play("click");
    expect(AudioContext).not.toHaveBeenCalled();
  });

  it("play() creates a buffer source and starts it", async () => {
    const engine = await importFreshEngine();
    engine.play("click");
    expect(mockSourceNode.connect).toHaveBeenCalledWith(mockGainNode);
    expect(mockSourceNode.start).toHaveBeenCalledWith(0);
  });

  it("resumes suspended AudioContext on play()", async () => {
    mockCtxState = "suspended";
    const engine = await importFreshEngine();
    engine.play("click");
    expect(mockResume).toHaveBeenCalled();
  });

  it("setEnabled persists to localStorage", async () => {
    const engine = await importFreshEngine();
    engine.setEnabled(false);
    expect(localStorage.getItem("gamelord:sfx-enabled")).toBe("false");
    expect(engine.getPreferences().enabled).toBe(false);
  });

  it("setVolume persists to localStorage and updates gain", async () => {
    const engine = await importFreshEngine();
    engine.play("click"); // force initialization
    engine.setVolume(0.75);
    expect(localStorage.getItem("gamelord:sfx-volume")).toBe("0.75");
    expect(engine.getPreferences().volume).toBe(0.75);
    expect(mockGainNode.gain.value).toBe(0.75);
  });

  it("setVolume clamps to [0, 1]", async () => {
    const engine = await importFreshEngine();
    engine.setVolume(1.5);
    expect(engine.getPreferences().volume).toBe(1);
    engine.setVolume(-0.3);
    expect(engine.getPreferences().volume).toBe(0);
  });

  it("subscribe notifies listeners on preference changes", async () => {
    const engine = await importFreshEngine();
    const listener = vi.fn();
    const unsubscribe = engine.subscribe(listener);

    engine.setEnabled(false);
    expect(listener).toHaveBeenCalledTimes(1);

    engine.setVolume(0.3);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    engine.setEnabled(true);
    expect(listener).toHaveBeenCalledTimes(2); // no more calls after unsubscribe
  });

  it("only initializes AudioContext once across multiple plays", async () => {
    const engine = await importFreshEngine();
    engine.play("click");
    engine.play("toggleOn");
    engine.play("saveState");
    expect(AudioContext).toHaveBeenCalledTimes(1);
  });
});
