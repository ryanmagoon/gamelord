import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock SfxEngine before importing useSfx.
// getPreferences must return the *same* object reference when nothing changed,
// otherwise useSyncExternalStore triggers infinite re-renders.
const mockPlay = vi.fn();
const mockSetEnabled = vi.fn();
const mockSetVolume = vi.fn();
let cachedPreferences = { enabled: true, volume: 0.5 };
const subscribers = new Set<() => void>();

function updatePreferences(patch: Partial<typeof cachedPreferences>) {
  cachedPreferences = { ...cachedPreferences, ...patch };
  for (const cb of subscribers) {
    cb();
  }
}

vi.mock("../lib/audio/SfxEngine", () => ({
  sfxEngine: {
    getPreferences: () => cachedPreferences,
    play: (...args: Array<unknown>) => mockPlay(...args),
    setEnabled: (v: boolean) => {
      mockSetEnabled(v);
      updatePreferences({ enabled: v });
    },
    setVolume: (v: number) => {
      mockSetVolume(v);
      updatePreferences({ volume: v });
    },
    subscribe: (cb: () => void) => {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
  },
}));

import { useSfx } from "./useSfx";

describe("useSfx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cachedPreferences = { enabled: true, volume: 0.5 };
    subscribers.clear();
  });

  it("returns current preferences", () => {
    const { result } = renderHook(() => useSfx());
    expect(result.current.preferences).toEqual({ enabled: true, volume: 0.5 });
  });

  it("play() delegates to sfxEngine.play()", () => {
    const { result } = renderHook(() => useSfx());
    result.current.play("click");
    expect(mockPlay).toHaveBeenCalledWith("click");
  });

  it("setEnabled updates preferences reactively", () => {
    const { result } = renderHook(() => useSfx());
    act(() => {
      result.current.setEnabled(false);
    });
    expect(mockSetEnabled).toHaveBeenCalledWith(false);
    expect(result.current.preferences.enabled).toBe(false);
  });

  it("setVolume updates preferences reactively", () => {
    const { result } = renderHook(() => useSfx());
    act(() => {
      result.current.setVolume(0.8);
    });
    expect(mockSetVolume).toHaveBeenCalledWith(0.8);
    expect(result.current.preferences.volume).toBe(0.8);
  });

  it("play returns a stable reference across renders", () => {
    const { rerender, result } = renderHook(() => useSfx());
    const firstPlay = result.current.play;
    rerender();
    expect(result.current.play).toBe(firstPlay);
  });
});
