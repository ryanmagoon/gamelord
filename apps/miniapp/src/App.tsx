import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import type { CheckpointCoordinator } from "./checkpoint";
import { createCheckpointCoordinator } from "./checkpoint";
import { MINIAPP_GAMES, toMiniappGame, type MiniappGame } from "./games";
import { NesPlayer } from "./NesPlayer";
import type { GameLordPersistence, SavedSession } from "./persistence";
import { createGameLordPersistence } from "./persistence";
import {
  createImportedGameRecord,
  MAX_IMPORTED_GAMES,
  type ImportedGameRecord,
} from "./romLibrary";

interface AppProps {
  readonly resolveAssetUrl?: (path: string) => string;
  readonly persistence?: GameLordPersistence;
  readonly checkpoints?: CheckpointCoordinator;
}

const resolvePreviewAssetUrl = (path: string) => `/${path}`;
const previewPersistence = createGameLordPersistence({ preview: true });
const previewCheckpoints = createCheckpointCoordinator();
const savedAtFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

interface ActiveGame {
  readonly game: MiniappGame;
  readonly restoreSession?: SavedSession;
}

interface GameCardProps {
  readonly game: MiniappGame;
  readonly index: number;
  readonly onPlay: () => void;
}

function GameCard({ game, index, onPlay }: GameCardProps) {
  return (
    <button
      className="game-card"
      style={{ "--game-accent": game.accent, "--card-index": index } as React.CSSProperties}
      type="button"
      onClick={onPlay}
    >
      <span className={`cover-frame${game.source === "imported" ? " imported-cover" : ""}`}>
        {game.source === "bundled" ? (
          <img src={game.coverUrl} alt="" />
        ) : (
          <span className="cartridge-art" aria-hidden="true">
            <span>NES</span>
            <strong>MY ROM</strong>
          </span>
        )}
        <span className="play-chip" aria-hidden="true">
          PLAY
        </span>
      </span>
      <span className="game-copy">
        <strong>{game.title}</strong>
        <small>{game.subtitle}</small>
      </span>
      <span className="card-arrow" aria-hidden="true">
        ↗
      </span>
    </button>
  );
}

export function App({
  resolveAssetUrl = resolvePreviewAssetUrl,
  persistence = previewPersistence,
  checkpoints = previewCheckpoints,
}: AppProps) {
  const [activeGame, setActiveGame] = useState<ActiveGame | null>(null);
  const [savedSession, setSavedSession] = useState<SavedSession | null>(null);
  const [importedRecords, setImportedRecords] = useState<ReadonlyArray<ImportedGameRecord>>([]);
  const [saveLibraryStatus, setSaveLibraryStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [libraryMutation, setLibraryMutation] = useState(false);
  const [libraryMessage, setLibraryMessage] = useState<string | null>(null);
  const importedGames = useMemo(() => importedRecords.map(toMiniappGame), [importedRecords]);
  const allGames = useMemo(() => [...importedGames, ...MINIAPP_GAMES], [importedGames]);

  useEffect(() => {
    let disposed = false;
    void Promise.all([persistence.loadSession(), persistence.loadLibrary()])
      .then(([session, records]) => {
        if (!disposed) {
          setSavedSession(session);
          setImportedRecords(records);
          setSaveLibraryStatus("ready");
        }
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setSaveLibraryStatus("error");
          setLibraryMessage(
            error instanceof Error ? error.message : "Workspace storage is unavailable.",
          );
        }
      });
    return () => {
      disposed = true;
    };
  }, [persistence]);

  const importRom = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file || libraryMutation) {
      return;
    }

    setLibraryMutation(true);
    setLibraryMessage(`Checking ${file.name}…`);
    try {
      const record = await createImportedGameRecord(file);
      const replacing = importedRecords.some((game) => game.id === record.id);
      if (!replacing && importedRecords.length >= MAX_IMPORTED_GAMES) {
        throw new Error(`Your library can hold up to ${MAX_IMPORTED_GAMES} personal cartridges.`);
      }
      const nextRecords = [record, ...importedRecords.filter((game) => game.id !== record.id)];
      await persistence.saveLibrary(nextRecords);
      setImportedRecords(nextRecords);
      setSaveLibraryStatus("ready");
      setLibraryMessage(`${record.title} ${replacing ? "updated" : "added"}.`);
    } catch (error) {
      setLibraryMessage(
        error instanceof Error ? error.message : "That cartridge could not be added.",
      );
    } finally {
      setLibraryMutation(false);
    }
  };

  const removeRom = async (record: ImportedGameRecord) => {
    if (libraryMutation) {
      return;
    }
    setLibraryMutation(true);
    setLibraryMessage(`Removing ${record.title}…`);
    try {
      const nextRecords = importedRecords.filter((game) => game.id !== record.id);
      await persistence.saveLibrary(nextRecords);
      setImportedRecords(nextRecords);
      setLibraryMessage(`${record.title} removed. Your original file was not changed.`);
    } catch {
      setLibraryMessage(`${record.title} could not be removed.`);
    } finally {
      setLibraryMutation(false);
    }
  };

  if (activeGame) {
    return (
      <NesPlayer
        key={`${activeGame.game.id}:${activeGame.restoreSession?.savedAt ?? "new"}`}
        game={activeGame.game}
        resolveAssetUrl={resolveAssetUrl}
        initialSession={activeGame.restoreSession}
        savedSession={savedSession?.gameId === activeGame.game.id ? savedSession : undefined}
        persistence={persistence}
        checkpoints={checkpoints}
        onSessionSaved={setSavedSession}
        onExit={() => setActiveGame(null)}
      />
    );
  }

  const continueGame = savedSession
    ? allGames.find((game) => game.id === savedSession.gameId)
    : undefined;

  return (
    <main className="library-shell">
      <header className="library-header">
        <div>
          <span className="eyebrow">TAP MINIAPP · NES</span>
          <h1>
            Game<span>Lord</span>
          </h1>
          <p>Bring your own .nes cartridge or jump into a redistributable homebrew game.</p>
        </div>
        <div className="library-actions">
          <label className={`import-button${libraryMutation ? " import-button-disabled" : ""}`}>
            <input
              type="file"
              accept=".nes,application/octet-stream"
              disabled={libraryMutation}
              onChange={(event) => void importRom(event)}
            />
            <span aria-hidden="true">＋</span>
            {libraryMutation ? "Working…" : "Import ROM"}
          </label>
          <div className={`status-pill status-pill-${saveLibraryStatus}`}>
            <span />
            {saveLibraryStatus === "loading"
              ? "SYNCING"
              : saveLibraryStatus === "error"
                ? "STORAGE ERROR"
                : "READY"}
          </div>
        </div>
      </header>

      <p className="library-message" aria-live="polite">
        {libraryMessage ?? "Your personal ROMs stay in this workspace and are never bundled."}
      </p>

      {continueGame && savedSession ? (
        <section className="continue-panel" aria-label="Continue playing">
          <div>
            <span className="eyebrow">CONTINUE PLAYING</span>
            <strong>{continueGame.title}</strong>
            <small>Saved {savedAtFormatter.format(savedSession.savedAt)}</small>
          </div>
          <button
            type="button"
            onClick={() => setActiveGame({ game: continueGame, restoreSession: savedSession })}
          >
            Resume
            <span aria-hidden="true">→</span>
          </button>
        </section>
      ) : null}

      {importedGames.length > 0 ? (
        <section className="collection-section" aria-labelledby="personal-library-heading">
          <div className="collection-heading">
            <div>
              <span className="eyebrow">PRIVATE TO THIS WORKSPACE</span>
              <h2 id="personal-library-heading">My cartridges</h2>
            </div>
            <small>
              {importedGames.length} / {MAX_IMPORTED_GAMES}
            </small>
          </div>
          <div className="game-grid">
            {importedGames.map((game, index) => {
              const record = importedRecords[index];
              return (
                <div className="imported-card-shell" key={game.id}>
                  <GameCard game={game} index={index} onPlay={() => setActiveGame({ game })} />
                  <button
                    className="remove-rom-button"
                    type="button"
                    disabled={libraryMutation}
                    onClick={() => void removeRom(record)}
                    aria-label={`Remove ${game.title} from GameLord`}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="collection-section" aria-labelledby="homebrew-heading">
        <div className="collection-heading">
          <div>
            <span className="eyebrow">LEGALLY REDISTRIBUTABLE</span>
            <h2 id="homebrew-heading">Homebrew collection</h2>
          </div>
          <small>{MINIAPP_GAMES.length} included</small>
        </div>
        <div className="game-grid">
          {MINIAPP_GAMES.map((game, index) => (
            <GameCard
              game={game}
              index={index}
              key={game.id}
              onPlay={() => setActiveGame({ game })}
            />
          ))}
        </div>
      </section>

      <footer className="library-footer">
        <span>YOUR FILES ARE NEVER INCLUDED IN THE MINIAPP PACKAGE</span>
        <span>KEYBOARD + GAMEPAD</span>
      </footer>
    </main>
  );
}
