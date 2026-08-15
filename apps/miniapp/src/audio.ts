import type { Browser as JsnesBrowser } from "jsnes";

export type AudioStatus = "starting" | "on" | "muted" | "unsupported" | "error";

interface JsnesSpeakers {
  audioCtx: AudioContext | null;
  node: AudioWorkletNode | null;
  batchPos: number;
  readonly onBufferUnderrun?: () => void;
  start(): void | Promise<void>;
  stop(): void;
}

interface BrowserWithSpeakers extends JsnesBrowser {
  readonly _speakers?: JsnesSpeakers;
}

interface NesAudioClock {
  opts?: {
    sampleRate?: number;
  };
  papu?: {
    sampleRate: number;
  };
  setFramerate(rate: number): void;
}

export interface GameAudioController {
  start(): Promise<void>;
  toggle(): Promise<void>;
  dispose(): void;
}

function synchronizeSampleRate(browser: JsnesBrowser, sampleRate: number) {
  const nes = browser.nes as typeof browser.nes & NesAudioClock;
  if (nes.opts) {
    nes.opts.sampleRate = sampleRate;
  }
  if (nes.papu) {
    nes.papu.sampleRate = sampleRate;
    nes.setFramerate(60);
  }
}

export function installGameAudio(
  browser: JsnesBrowser,
  workletUrl: string,
  onStatusChange: (status: AudioStatus) => void,
): GameAudioController {
  const speakers = (browser as BrowserWithSpeakers)._speakers;
  if (!speakers) {
    onStatusChange("error");
    return {
      async start() {},
      async toggle() {},
      dispose() {},
    };
  }

  let disposed = false;
  let startPromise: Promise<void> | null = null;
  let resumeOnInteraction: (() => void) | null = null;

  const removeResumeListeners = () => {
    if (!resumeOnInteraction) {
      return;
    }
    document.removeEventListener("keydown", resumeOnInteraction);
    document.removeEventListener("mousedown", resumeOnInteraction);
    document.removeEventListener("touchstart", resumeOnInteraction);
    resumeOnInteraction = null;
  };

  const updateStatus = () => {
    const context = speakers.audioCtx;
    if (!context || context.state === "closed") {
      onStatusChange("muted");
    } else {
      onStatusChange(context.state === "running" ? "on" : "muted");
    }
  };

  const resume = async () => {
    const context = speakers.audioCtx;
    if (context?.state === "suspended") {
      await context.resume();
    }
    removeResumeListeners();
    updateStatus();
  };

  const listenForResume = () => {
    removeResumeListeners();
    resumeOnInteraction = () => void resume();
    document.addEventListener("keydown", resumeOnInteraction);
    document.addEventListener("mousedown", resumeOnInteraction);
    document.addEventListener("touchstart", resumeOnInteraction);
  };

  const stop = () => {
    removeResumeListeners();
    const context = speakers.audioCtx;
    speakers.node?.disconnect();
    speakers.node = null;
    speakers.audioCtx = null;
    speakers.batchPos = 0;
    if (context && context.state !== "closed") {
      void context.close();
    }
    if (!disposed) {
      onStatusChange("muted");
    }
  };

  const start = async () => {
    if (disposed) {
      return;
    }
    if (speakers.audioCtx) {
      synchronizeSampleRate(browser, speakers.audioCtx.sampleRate);
      return;
    }
    if (!globalThis.AudioContext || !globalThis.AudioWorkletNode) {
      onStatusChange("unsupported");
      return;
    }

    onStatusChange("starting");
    const context = new AudioContext();
    speakers.audioCtx = context;
    synchronizeSampleRate(browser, context.sampleRate);
    context.addEventListener("statechange", updateStatus);

    try {
      await context.audioWorklet.addModule(workletUrl);
      if (disposed || speakers.audioCtx !== context) {
        if (context.state !== "closed") {
          await context.close();
        }
        return;
      }

      const node = new AudioWorkletNode(context, "gamelord-nes-audio", {
        outputChannelCount: [2],
      });
      speakers.node = node;
      node.port.onmessage = ({ data }) => {
        if (data?.type === "underrun") {
          speakers.onBufferUnderrun?.();
        }
      };
      node.connect(context.destination);

      if (context.state === "suspended") {
        listenForResume();
      }
      updateStatus();
    } catch {
      stop();
      if (!disposed) {
        onStatusChange("error");
      }
    }
  };

  speakers.start = () => {
    if (!startPromise) {
      startPromise = start().finally(() => {
        startPromise = null;
      });
    }
    return startPromise;
  };
  speakers.stop = stop;

  return {
    async start() {
      await speakers.start();
    },
    async toggle() {
      if (!speakers.audioCtx) {
        await speakers.start();
      }
      const context = speakers.audioCtx;
      if (!context || context.state === "closed") {
        return;
      }
      if (context.state === "running") {
        await context.suspend();
        removeResumeListeners();
      } else {
        await resume();
      }
      updateStatus();
    },
    dispose() {
      disposed = true;
      stop();
    },
  };
}
