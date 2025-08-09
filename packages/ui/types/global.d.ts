export interface GamelordAPI {
  core: {
    load: (options: CoreOptions) => Promise<{ success: boolean; error?: string }>;
    unload: () => Promise<{ success: boolean; error?: string }>;
  };
  emulation: {
    pause: () => Promise<{ success: boolean }>;
    resume: () => Promise<{ success: boolean }>;
  };
  saveState: {
    save: (slot: number) => Promise<{ success: boolean }>;
    load: (slot: number) => Promise<{ success: boolean }>;
  };
  input: {
    sendButton: (playerId: number, button: string, pressed: boolean) => void;
  };
  on: (channel: string, callback: (...args: any[]) => void) => void;
  removeAllListeners: (channel: string) => void;
}

export interface CoreOptions {
  corePath: string;
  romPath: string;
  saveStatePath?: string;
}

export interface VideoFrame {
  data: ArrayBuffer;
  width: number;
  height: number;
  timestamp: number;
}

export interface AudioSamples {
  samples: Float32Array;
  sampleRate: number;
  timestamp: number;
}

declare global {
  interface Window {
    gamelord: GamelordAPI;
  }
}