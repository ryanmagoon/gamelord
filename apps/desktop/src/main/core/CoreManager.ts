import { utilityProcess, MessageChannelMain, UtilityProcess, MessagePortMain } from 'electron';
import * as path from 'path';
import { EventEmitter } from 'events';

export interface CoreOptions {
  corePath: string;
  romPath: string;
  saveStatePath?: string;
}

export interface VideoFrame {
  data: Buffer;
  width: number;
  height: number;
  timestamp: number;
}

export interface AudioSamples {
  samples: Float32Array;
  sampleRate: number;
  timestamp: number;
}

export class CoreManager extends EventEmitter {
  private coreProcess: UtilityProcess | null = null;
  private messageChannel: MessagePortMain | null = null;
  private isRunning = false;

  constructor() {
    super();
  }

  async loadCore(options: CoreOptions): Promise<void> {
    if (this.coreProcess) {
      await this.unloadCore();
    }

    const { port1, port2 } = new MessageChannelMain();
    
    this.coreProcess = utilityProcess.fork(
      path.join(__dirname, '../workers/core-worker.js'),
      [],
      {
        serviceName: 'LibretroCore',
        stdio: 'pipe'
      }
    );

    this.coreProcess.on('spawn', () => {
      console.log('Core process spawned successfully');
    });

    this.coreProcess.on('exit', (code) => {
      console.log(`Core process exited with code ${code}`);
      this.cleanup();
    });

    this.coreProcess.postMessage({
      action: 'init',
      options
    }, [port1]);

    this.messageChannel = port2;
    this.setupMessageHandlers();
    this.isRunning = true;
  }

  private setupMessageHandlers(): void {
    if (!this.messageChannel) return;

    this.messageChannel.on('message', (event: any) => {
      const { type, data } = event.data;
      
      switch(type) {
        case 'videoFrame':
          this.handleVideoFrame(data);
          break;
        case 'audioSamples':
          this.handleAudioSamples(data);
          break;
        case 'error':
          this.handleError(data);
          break;
        case 'stateChanged':
          this.emit('stateChanged', data);
          break;
        case 'ready':
          this.emit('ready');
          break;
      }
    });
  }

  private handleVideoFrame(frame: VideoFrame): void {
    this.emit('videoFrame', frame);
  }

  private handleAudioSamples(samples: AudioSamples): void {
    this.emit('audioSamples', samples);
  }

  private handleError(error: Error): void {
    console.error('Core error:', error);
    this.emit('error', error);
  }

  async unloadCore(): Promise<void> {
    if (!this.coreProcess) return;

    this.coreProcess.postMessage({ action: 'shutdown' });
    
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.coreProcess?.kill();
        resolve();
      }, 5000);

      this.coreProcess?.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    this.cleanup();
  }

  private cleanup(): void {
    this.messageChannel?.close();
    this.messageChannel = null;
    this.coreProcess = null;
    this.isRunning = false;
  }

  pauseEmulation(): void {
    if (!this.coreProcess || !this.isRunning) return;
    this.coreProcess.postMessage({ action: 'pause' });
  }

  resumeEmulation(): void {
    if (!this.coreProcess || !this.isRunning) return;
    this.coreProcess.postMessage({ action: 'resume' });
  }

  saveState(slot: number): void {
    if (!this.coreProcess || !this.isRunning) return;
    this.coreProcess.postMessage({ action: 'saveState', slot });
  }

  loadState(slot: number): void {
    if (!this.coreProcess || !this.isRunning) return;
    this.coreProcess.postMessage({ action: 'loadState', slot });
  }

  sendInput(playerId: number, button: string, pressed: boolean): void {
    if (!this.coreProcess || !this.isRunning) return;
    this.coreProcess.postMessage({ 
      action: 'input', 
      playerId, 
      button, 
      pressed 
    });
  }
}