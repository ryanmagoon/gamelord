import { useCallback, useEffect, useRef, useState } from "react";
import type { Browser as JsnesBrowser } from "jsnes";
import { installGameAudio, type AudioStatus, type GameAudioController } from "./audio";
import type { CheckpointCoordinator } from "./checkpoint";
import type { MiniappGame } from "./games";
import type { GameLordPersistence, SavedSession } from "./persistence";
import { createSavedSession, decodeEmulatorState, encodeEmulatorState } from "./persistence";
import { base64ToBytes } from "./romLibrary";

interface NesPlayerProps {
  readonly game: MiniappGame;
  readonly resolveAssetUrl: (path: string) => string;
  readonly initialSession?: SavedSession;
  readonly savedSession?: SavedSession;
  readonly persistence: GameLordPersistence;
  readonly checkpoints: CheckpointCoordinator;
  readonly onSessionSaved: (session: SavedSession) => void;
  readonly onExit: () => void;
}

type PlayerStatus = "loading" | "running" | "paused" | "error";
type SaveStatus = "idle" | "saving" | "saved" | "loading" | "restored" | "error";

export function NesPlayer({
  game,
  resolveAssetUrl,
  initialSession,
  savedSession,
  persistence,
  checkpoints,
  onSessionSaved,
  onExit,
}: NesPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const browserRef = useRef<JsnesBrowser | null>(null);
  const audioControllerRef = useRef<GameAudioController | null>(null);
  const manuallyPausedRef = useRef(false);
  const initialSessionRef = useRef(initialSession);
  const saveInFlightRef = useRef<Promise<SavedSession | null> | null>(null);
  const [status, setStatus] = useState<PlayerStatus>("loading");
  const statusRef = useRef<PlayerStatus>("loading");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [audioStatus, setAudioStatus] = useState<AudioStatus>("starting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const saveCurrentSession = useCallback(
    async (silent = false): Promise<SavedSession | null> => {
      const browser = browserRef.current;
      if (!browser || statusRef.current === "loading" || statusRef.current === "error") {
        return null;
      }
      if (saveInFlightRef.current) {
        return saveInFlightRef.current;
      }

      if (!silent) {
        setSaveStatus("saving");
      }
      const save = (async () => {
        try {
          const shouldResume = statusRef.current === "running" && !document.hidden;
          browser.stop();
          const emulatorState = browser.nes.toJSON();
          if (shouldResume) {
            browser.start();
          }
          const encodedState = await encodeEmulatorState(emulatorState);
          const session = createSavedSession(game.id, encodedState);
          await persistence.saveSession(session);
          onSessionSaved(session);
          setSaveStatus("saved");
          return session;
        } catch {
          setSaveStatus("error");
          return null;
        } finally {
          saveInFlightRef.current = null;
        }
      })();
      saveInFlightRef.current = save;
      return save;
    },
    [game.id, onSessionSaved, persistence],
  );

  const loadSession = useCallback(async (session: SavedSession) => {
    const browser = browserRef.current;
    if (!browser) {
      return;
    }
    setSaveStatus("loading");
    try {
      browser.stop();
      browser.nes.fromJSON(await decodeEmulatorState(session.state));
      if (!manuallyPausedRef.current) {
        browser.start();
      }
      setErrorMessage(null);
      setStatus(manuallyPausedRef.current ? "paused" : "running");
      setSaveStatus("restored");
    } catch {
      if (!manuallyPausedRef.current) {
        browser.start();
      }
      setSaveStatus("error");
    }
  }, []);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;

    const start = async () => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      try {
        const { Browser } = await import("jsnes");
        let romData: Uint8Array;
        if (game.source === "imported") {
          romData = base64ToBytes(game.romBase64);
        } else {
          const response = await fetch(resolveAssetUrl(game.romPath), {
            signal: controller.signal,
          });
          if (!response.ok) {
            throw new Error(`ROM asset returned ${response.status}`);
          }
          romData = new Uint8Array(await response.arrayBuffer());
        }
        if (disposed) {
          return;
        }

        const browser = new Browser({
          container,
          onError(error) {
            if (disposed) {
              return;
            }
            setErrorMessage(error instanceof Error ? error.message : String(error));
            setStatus("error");
          },
        });
        const audioController = installGameAudio(
          browser,
          resolveAssetUrl("static/nes-audio-worklet.js"),
          setAudioStatus,
        );
        audioControllerRef.current = audioController;
        await audioController.start();
        if (disposed) {
          audioController.dispose();
          browser.destroy();
          return;
        }

        browser.nes.loadROM(romData);
        const sessionToRestore = initialSessionRef.current;
        if (sessionToRestore) {
          setSaveStatus("loading");
          browser.nes.fromJSON(await decodeEmulatorState(sessionToRestore.state));
          setSaveStatus("restored");
        }
        browser.start();
        browserRef.current = browser;
        browser.fitInParent();
        resizeObserver = new ResizeObserver(() => browser.fitInParent());
        resizeObserver.observe(container);
        setStatus("running");
      } catch (error) {
        if (disposed || controller.signal.aborted) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : "The emulator could not start.");
        setStatus("error");
      }
    };

    const handleVisibilityChange = () => {
      const browser = browserRef.current;
      if (!browser) {
        return;
      }
      if (document.hidden) {
        browser.stop();
        void saveCurrentSession(true);
      } else if (!manuallyPausedRef.current) {
        browser.start();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    void start();

    return () => {
      disposed = true;
      controller.abort();
      resizeObserver?.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      audioControllerRef.current?.dispose();
      audioControllerRef.current = null;
      browserRef.current?.destroy();
      browserRef.current = null;
    };
  }, [game, resolveAssetUrl, saveCurrentSession]);

  useEffect(
    () => checkpoints.register(async () => void (await saveCurrentSession(true))),
    [checkpoints, saveCurrentSession],
  );

  const togglePause = () => {
    const browser = browserRef.current;
    if (!browser || status === "loading" || status === "error") {
      return;
    }

    if (status === "paused") {
      manuallyPausedRef.current = false;
      browser.start();
      setStatus("running");
    } else {
      manuallyPausedRef.current = true;
      browser.stop();
      setStatus("paused");
    }
  };

  const toggleAudio = async () => {
    await audioControllerRef.current?.toggle();
  };

  const reset = () => {
    const browser = browserRef.current;
    if (!browser) {
      return;
    }
    browser.stop();
    browser.nes.reloadROM();
    if (!manuallyPausedRef.current) {
      browser.start();
    }
    setErrorMessage(null);
    setStatus(manuallyPausedRef.current ? "paused" : "running");
    setSaveStatus("idle");
  };

  const exitToLibrary = async () => {
    await saveCurrentSession(true);
    onExit();
  };

  const saveLabel =
    saveStatus === "saving"
      ? "Saving…"
      : saveStatus === "saved"
        ? "Saved"
        : saveStatus === "loading"
          ? "Loading…"
          : saveStatus === "restored"
            ? "Restored"
            : saveStatus === "error"
              ? "Save unavailable"
              : "";
  const audioLabel =
    audioStatus === "on"
      ? "Mute"
      : audioStatus === "starting"
        ? "Audio…"
        : audioStatus === "unsupported" || audioStatus === "error"
          ? "No audio"
          : "Sound on";

  return (
    <main className="player-shell">
      <header className="player-toolbar">
        <button
          className="icon-button"
          type="button"
          onClick={() => void exitToLibrary()}
          aria-label="Save and return to library"
        >
          <span aria-hidden="true">←</span>
        </button>
        <div className="player-title-group">
          <span className="eyebrow">NOW PLAYING</span>
          <h1>{game.title}</h1>
        </div>
        <div className="player-actions">
          <span className={`save-indicator save-indicator-${saveStatus}`} aria-live="polite">
            {saveLabel}
          </span>
          <button
            className="toolbar-button"
            type="button"
            onClick={() => void saveCurrentSession()}
            disabled={status === "loading" || status === "error" || saveStatus === "saving"}
          >
            Save
          </button>
          <button
            className="toolbar-button"
            type="button"
            onClick={() => savedSession && void loadSession(savedSession)}
            disabled={!savedSession || status === "loading" || saveStatus === "loading"}
          >
            Load
          </button>
          <button
            className="toolbar-button"
            type="button"
            onClick={reset}
            disabled={status === "loading"}
          >
            Reset
          </button>
          <button
            className="toolbar-button"
            type="button"
            onClick={() => void toggleAudio()}
            disabled={
              status === "loading" ||
              status === "error" ||
              audioStatus === "starting" ||
              audioStatus === "unsupported" ||
              audioStatus === "error"
            }
            aria-pressed={audioStatus === "on"}
          >
            {audioLabel}
          </button>
          <button
            className="toolbar-button toolbar-button-primary"
            type="button"
            onClick={togglePause}
            disabled={status === "loading" || status === "error"}
          >
            {status === "paused" ? "Resume" : "Pause"}
          </button>
        </div>
      </header>

      <section
        className="console-stage"
        style={{ "--game-accent": game.accent } as React.CSSProperties}
      >
        <div className="console-glow" aria-hidden="true" />
        <div className="screen-bezel">
          <div
            ref={containerRef}
            className="nes-mount"
            aria-label={`${game.title} game screen`}
            tabIndex={0}
          />
          {status === "loading" ? (
            <div className="player-message" role="status">
              <span className="loading-dot" />
              Loading cartridge…
            </div>
          ) : null}
          {status === "paused" ? <div className="player-message paused-message">Paused</div> : null}
          {status === "error" ? (
            <div className="player-message error-message" role="alert">
              <strong>Cartridge failed to load</strong>
              <span>{errorMessage}</span>
            </div>
          ) : null}
        </div>
      </section>

      <footer className="controls-strip">
        <div>
          <kbd>↑↓←→</kbd>
          <span>Move</span>
        </div>
        <div>
          <kbd>Z</kbd>
          <span>B</span>
        </div>
        <div>
          <kbd>X</kbd>
          <span>A</span>
        </div>
        <div>
          <kbd>Enter</kbd>
          <span>Start</span>
        </div>
        <div>
          <kbd>Ctrl</kbd>
          <span>Select</span>
        </div>
        <span className="controller-note">Gamepads are detected automatically</span>
      </footer>
    </main>
  );
}
