import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useControllerPauseMenu } from "./useControllerPauseMenu";

function setup(paused = false) {
  const emulation = {
    pause: vi.fn().mockResolvedValue({ success: true }),
    resume: vi.fn().mockResolvedValue({ success: true }),
  };
  const onError = vi.fn();
  const hook = renderHook(() => useControllerPauseMenu(paused, emulation, onError));
  return { ...hook, emulation, onError };
}
describe("controller pause ownership", () => {
  it("pauses before showing the menu and resumes after settings closes", async () => {
    const { result, emulation } = setup();
    await act(() => result.current.open());
    expect(result.current.menuOpen).toBe(true);
    act(() => result.current.showSettings());
    expect(result.current.settingsOpen).toBe(true);
    expect(emulation.resume).not.toHaveBeenCalled();
    act(() => result.current.changeSettings(false));
    await act(() => result.current.close());
    expect(result.current.menuOpen).toBe(false);
    expect(emulation.resume).toHaveBeenCalledOnce();
  });
  it("preserves a game that was already paused", async () => {
    const { result, emulation } = setup(true);
    await act(() => result.current.open());
    await act(() => result.current.close());
    expect(emulation.pause).not.toHaveBeenCalled();
    expect(emulation.resume).not.toHaveBeenCalled();
  });
  it("lets Resume game explicitly resume a previously paused game", async () => {
    const { result, emulation } = setup(true);
    await act(() => result.current.open());
    await act(() => result.current.close(true));
    expect(emulation.resume).toHaveBeenCalledOnce();
    expect(result.current.menuOpen).toBe(false);
  });
  it("does not open when the IPC result reports a pause failure", async () => {
    const { result, emulation, onError } = setup();
    emulation.pause.mockResolvedValue({ success: false });
    await act(() => result.current.open());
    expect(result.current.menuOpen).toBe(false);
    expect(onError).toHaveBeenCalledOnce();
  });
  it("keeps the menu available when resuming fails, then allows retry", async () => {
    const { result, emulation, onError } = setup();
    await act(() => result.current.open());
    emulation.resume.mockResolvedValueOnce({ success: false });
    await act(() => result.current.close());
    expect(result.current.menuOpen).toBe(true);
    expect(onError).toHaveBeenCalledOnce();
    await act(() => result.current.close());
    expect(result.current.menuOpen).toBe(false);
  });
  it("serializes overlapping requests", async () => {
    const { result, emulation } = setup();
    await act(async () => {
      await Promise.all([result.current.open(), result.current.open()]);
    });
    expect(emulation.pause).toHaveBeenCalledOnce();
  });
});
