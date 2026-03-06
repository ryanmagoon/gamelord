import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EmulationWorkerClient } from "./EmulationWorkerClient";
import type { WorkerEvent, AVInfo } from "../workers/core-worker-protocol";

// ---------------------------------------------------------------------------
// Mock Electron's utilityProcess.fork()
// ---------------------------------------------------------------------------

const mockPostMessage = vi.fn();
const mockKill = vi.fn();
const mockRemoveListener = vi.fn();

/** Listeners registered via mockProcess.on() */
let processListeners: Record<string, Array<(...args: Array<unknown>) => void>> = {};

const mockProcess = {
  kill: mockKill,
  on: vi.fn((event: string, listener: (...args: Array<unknown>) => void) => {
    if (!processListeners[event]) {
      processListeners[event] = [];
    }
    processListeners[event].push(listener);
  }),
  postMessage: mockPostMessage,
  removeListener: mockRemoveListener,
};

vi.mock("electron", () => ({
  utilityProcess: {
    fork: vi.fn(() => mockProcess),
  },
}));

vi.mock("electron-log/main", () => ({
  default: {
    scope: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    transports: { file: {}, console: {} },
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_AV_INFO: AVInfo = {
  geometry: {
    aspectRatio: 1.333,
    baseHeight: 240,
    baseWidth: 256,
    maxHeight: 240,
    maxWidth: 256,
  },
  timing: {
    fps: 60.0988,
    sampleRate: 44_100,
  },
};

const TEST_INIT_OPTIONS = {
  addonPath: "/native/gamelord_libretro.node",
  corePath: "/cores/fceumm.dylib",
  romPath: "/roms/zelda.nes",
  saveDir: "/saves",
  saveStatesDir: "/savestates",
  sramDir: "/saves",
  systemDir: "/bios",
};

/** Simulate the worker sending a message to the main process. */
function emitWorkerMessage(event: WorkerEvent): void {
  const listeners = processListeners["message"] ?? [];
  for (const listener of listeners) {
    listener(event);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EmulationWorkerClient", () => {
  let client: EmulationWorkerClient;

  beforeEach(() => {
    vi.useFakeTimers();
    processListeners = {};
    mockPostMessage.mockClear();
    mockKill.mockClear();
    mockRemoveListener.mockClear();
    mockProcess.on.mockClear();
    client = new EmulationWorkerClient();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("init", () => {
    it("sends init command and resolves with AV info on ready", async () => {
      const initPromise = client.init(TEST_INIT_OPTIONS);

      // Worker responds with ready
      emitWorkerMessage({ avInfo: TEST_AV_INFO, type: "ready" });

      const avInfo = await initPromise;

      expect(avInfo).toEqual(TEST_AV_INFO);
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: "init", corePath: TEST_INIT_OPTIONS.corePath }),
      );
    });

    it("rejects on fatal error during init", async () => {
      const initPromise = client.init(TEST_INIT_OPTIONS);

      emitWorkerMessage({
        fatal: true,
        message: "Failed to load core",
        type: "error",
      });

      await expect(initPromise).rejects.toThrow("Failed to load core");
    });

    it("rejects on timeout if worker never becomes ready", async () => {
      let caughtError: unknown = null;
      const initPromise = client.init(TEST_INIT_OPTIONS).catch((error: unknown) => {
        caughtError = error;
      });

      // Advance past timeout
      await vi.advanceTimersByTimeAsync(11_000);

      await initPromise;
      expect(caughtError).toBeInstanceOf(Error);
      expect((caughtError as Error).message).toMatch("did not become ready");
    });
  });

  describe("fire-and-forget commands", () => {
    beforeEach(async () => {
      const initPromise = client.init(TEST_INIT_OPTIONS);
      emitWorkerMessage({ avInfo: TEST_AV_INFO, type: "ready" });
      await initPromise;
    });

    it("setInput sends input command", () => {
      client.setInput(0, 3, true);
      expect(mockPostMessage).toHaveBeenCalledWith({
        action: "input",
        id: 3,
        port: 0,
        pressed: true,
      });
    });

    it("pause sends pause command", () => {
      client.pause();
      expect(mockPostMessage).toHaveBeenCalledWith({ action: "pause" });
    });

    it("resume sends resume command", () => {
      client.resume();
      expect(mockPostMessage).toHaveBeenCalledWith({ action: "resume" });
    });

    it("reset sends reset command", () => {
      client.reset();
      expect(mockPostMessage).toHaveBeenCalledWith({ action: "reset" });
    });
  });

  describe("request/response commands", () => {
    beforeEach(async () => {
      const initPromise = client.init(TEST_INIT_OPTIONS);
      emitWorkerMessage({ avInfo: TEST_AV_INFO, type: "ready" });
      await initPromise;
    });

    it("saveState resolves on success response", async () => {
      const savePromise = client.saveState(1);

      // Extract the requestId from the postMessage call
      const lastCall = mockPostMessage.mock.calls.at(-1)[0];
      expect(lastCall.action).toBe("saveState");
      expect(lastCall.slot).toBe(1);

      emitWorkerMessage({
        requestId: lastCall.requestId,
        success: true,
        type: "response",
      });

      await expect(savePromise).resolves.toBeUndefined();
    });

    it("loadState rejects on error response", async () => {
      const loadPromise = client.loadState(3);

      const lastCall = mockPostMessage.mock.calls.at(-1)[0];
      emitWorkerMessage({
        error: "No save state in slot 3",
        requestId: lastCall.requestId,
        success: false,
        type: "response",
      });

      await expect(loadPromise).rejects.toThrow("No save state in slot 3");
    });

    it("saveSram resolves on success", async () => {
      const sramPromise = client.saveSram();

      const lastCall = mockPostMessage.mock.calls.at(-1)[0];
      emitWorkerMessage({
        requestId: lastCall.requestId,
        success: true,
        type: "response",
      });

      await expect(sramPromise).resolves.toBeUndefined();
    });

    it("screenshot returns the file path", async () => {
      const screenshotPromise = client.screenshot("/tmp/shot.raw");

      const lastCall = mockPostMessage.mock.calls.at(-1)[0];
      expect(lastCall.action).toBe("screenshot");
      expect(lastCall.outputPath).toBe("/tmp/shot.raw");

      emitWorkerMessage({
        data: { path: "/tmp/shot.raw" },
        requestId: lastCall.requestId,
        success: true,
        type: "response",
      });

      await expect(screenshotPromise).resolves.toBe("/tmp/shot.raw");
    });

    it("request times out after 10 seconds", async () => {
      let caughtError: unknown = null;
      const savePromise = client.saveState(0).catch((error: unknown) => {
        caughtError = error;
      });

      // Don't send a response — let it timeout
      await vi.advanceTimersByTimeAsync(11_000);

      await savePromise;
      expect(caughtError).toBeInstanceOf(Error);
      expect((caughtError as Error).message).toMatch("timed out");
    });
  });

  describe("event forwarding", () => {
    beforeEach(async () => {
      const initPromise = client.init(TEST_INIT_OPTIONS);
      emitWorkerMessage({ avInfo: TEST_AV_INFO, type: "ready" });
      await initPromise;
    });

    it("emits videoFrame events from worker", () => {
      const handler = vi.fn();
      client.on("videoFrame", handler);

      const frameData = Buffer.alloc(256 * 240 * 4);
      emitWorkerMessage({
        data: frameData,
        height: 240,
        type: "videoFrame",
        width: 256,
      });

      expect(handler).toHaveBeenCalledWith({
        data: frameData,
        height: 240,
        width: 256,
      });
    });

    it("emits audioSamples events from worker", () => {
      const handler = vi.fn();
      client.on("audioSamples", handler);

      const samples = Buffer.alloc(1470);
      emitWorkerMessage({
        sampleRate: 44_100,
        samples,
        type: "audioSamples",
      });

      expect(handler).toHaveBeenCalledWith({
        sampleRate: 44_100,
        samples,
      });
    });

    it("emits error events from worker", () => {
      const handler = vi.fn();
      client.on("error", handler);

      emitWorkerMessage({
        fatal: true,
        message: "Emulation crashed",
        type: "error",
      });

      expect(handler).toHaveBeenCalledWith({
        fatal: true,
        message: "Emulation crashed",
      });
    });
  });

  describe("shutdown", () => {
    beforeEach(async () => {
      const initPromise = client.init(TEST_INIT_OPTIONS);
      emitWorkerMessage({ avInfo: TEST_AV_INFO, type: "ready" });
      await initPromise;
    });

    it("sends shutdown command and resolves on response", async () => {
      const shutdownPromise = client.shutdown();

      const lastCall = mockPostMessage.mock.calls.at(-1)[0];
      expect(lastCall.action).toBe("shutdown");

      emitWorkerMessage({
        requestId: lastCall.requestId,
        success: true,
        type: "response",
      });

      await shutdownPromise;
      expect(client.isRunning()).toBe(false);
    });

    it("force-kills if shutdown times out", async () => {
      const shutdownPromise = client.shutdown();

      // Don't respond — let it timeout and force kill
      await vi.advanceTimersByTimeAsync(6000);

      await shutdownPromise;
      expect(mockKill).toHaveBeenCalled();
      expect(client.isRunning()).toBe(false);
    });

    it("rejects pending requests on cleanup", async () => {
      const savePromise = client.saveState(1);

      // Shutdown before save completes
      const shutdownPromise = client.shutdown();

      const shutdownCall = mockPostMessage.mock.calls.at(-1)[0];
      emitWorkerMessage({
        requestId: shutdownCall.requestId,
        success: true,
        type: "response",
      });

      await shutdownPromise;

      // The pending saveState should be rejected
      await expect(savePromise).rejects.toThrow("terminated");
    });
  });

  describe("unexpected exit", () => {
    beforeEach(async () => {
      const initPromise = client.init(TEST_INIT_OPTIONS);
      emitWorkerMessage({ avInfo: TEST_AV_INFO, type: "ready" });
      await initPromise;
    });

    it("emits error when worker exits while still running", () => {
      const handler = vi.fn();
      client.on("error", handler);

      // Simulate worker process exiting (e.g. Electron tearing down on quit)
      const exitListeners = processListeners["exit"] ?? [];
      for (const listener of exitListeners) {
        listener(0);
      }

      expect(handler).toHaveBeenCalledWith({
        fatal: true,
        message: "Emulation worker exited unexpectedly (code 0)",
      });
      expect(client.isRunning()).toBe(false);
    });

    it("does not emit error when worker exits after shutdown", async () => {
      const handler = vi.fn();
      client.on("error", handler);

      // Graceful shutdown first
      const shutdownPromise = client.shutdown();
      const lastCall = mockPostMessage.mock.calls.at(-1)[0];
      emitWorkerMessage({
        requestId: lastCall.requestId,
        success: true,
        type: "response",
      });
      await shutdownPromise;

      // Now simulate process exit
      const exitListeners = processListeners["exit"] ?? [];
      for (const listener of exitListeners) {
        listener(0);
      }

      expect(handler).not.toHaveBeenCalled();
    });

    it("does not emit error when prepareForQuit was called before process exits", () => {
      const handler = vi.fn();
      client.on("error", handler);

      // Synchronously suppress errors before async shutdown
      client.prepareForQuit();

      // Process exits before shutdown() is called (race condition during app quit)
      const exitListeners = processListeners["exit"] ?? [];
      for (const listener of exitListeners) {
        listener(0);
      }

      expect(handler).not.toHaveBeenCalled();
      expect(client.isRunning()).toBe(false);
    });
  });

  describe("SharedArrayBuffer allocation", () => {
    it("allocates SABs and sends setupSharedBuffers command after init", async () => {
      const initPromise = client.init(TEST_INIT_OPTIONS);
      emitWorkerMessage({ avInfo: TEST_AV_INFO, type: "ready" });
      await initPromise;

      const bufs = client.getSharedBuffers();
      expect(bufs).not.toBeNull();
      expect(bufs!.control).toBeInstanceOf(SharedArrayBuffer);
      expect(bufs!.video).toBeInstanceOf(SharedArrayBuffer);
      expect(bufs!.audio).toBeInstanceOf(SharedArrayBuffer);

      // Verify setupSharedBuffers command was sent to the worker
      const setupCall = mockPostMessage.mock.calls.find(
        (call) => call[0].action === "setupSharedBuffers",
      );
      expect(setupCall).toBeDefined();
      expect(setupCall![0].controlSAB).toBe(bufs!.control);
      expect(setupCall![0].videoSAB).toBe(bufs!.video);
      expect(setupCall![0].audioSAB).toBe(bufs!.audio);
      expect(setupCall![0].videoBufferSize).toBeGreaterThan(0);
    });

    it("initializes audio sample rate in control buffer", async () => {
      const initPromise = client.init(TEST_INIT_OPTIONS);
      emitWorkerMessage({ avInfo: TEST_AV_INFO, type: "ready" });
      await initPromise;

      const bufs = client.getSharedBuffers()!;
      const ctrl = new Int32Array(bufs.control);
      // CTRL_AUDIO_SAMPLE_RATE is at index 6
      expect(Atomics.load(ctrl, 6)).toBe(TEST_AV_INFO.timing.sampleRate);
    });

    it("clears shared buffers on shutdown", async () => {
      const initPromise = client.init(TEST_INIT_OPTIONS);
      emitWorkerMessage({ avInfo: TEST_AV_INFO, type: "ready" });
      await initPromise;

      expect(client.getSharedBuffers()).not.toBeNull();

      const shutdownPromise = client.shutdown();
      const lastCall = mockPostMessage.mock.calls.at(-1)[0];
      emitWorkerMessage({
        requestId: lastCall.requestId,
        success: true,
        type: "response",
      });
      await shutdownPromise;

      expect(client.getSharedBuffers()).toBeNull();
    });

    it("returns null for getSharedBuffers before init", () => {
      expect(client.getSharedBuffers()).toBeNull();
    });
  });

  describe("isRunning", () => {
    it("returns false before init", () => {
      expect(client.isRunning()).toBe(false);
    });

    it("returns true after init", async () => {
      const initPromise = client.init(TEST_INIT_OPTIONS);
      emitWorkerMessage({ avInfo: TEST_AV_INFO, type: "ready" });
      await initPromise;

      expect(client.isRunning()).toBe(true);
    });

    it("returns false after shutdown", async () => {
      const initPromise = client.init(TEST_INIT_OPTIONS);
      emitWorkerMessage({ avInfo: TEST_AV_INFO, type: "ready" });
      await initPromise;

      const shutdownPromise = client.shutdown();
      const lastCall = mockPostMessage.mock.calls.at(-1)[0];
      emitWorkerMessage({
        requestId: lastCall.requestId,
        success: true,
        type: "response",
      });
      await shutdownPromise;

      expect(client.isRunning()).toBe(false);
    });
  });
});
