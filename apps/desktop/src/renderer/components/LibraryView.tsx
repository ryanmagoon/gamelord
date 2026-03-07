import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  GameLibrary,
  Button,
  Badge,
  Input,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  CoreDownloadBanner,
  CommandPalette,
  cn,
  ArtworkSyncStore,
  type Game,
  type Game as UiGame,
  type GameCardMenuItem,
  type ArtworkSyncPhase,
  type CommandAction,
} from "@gamelord/ui";
import { Plus, FolderOpen, RefreshCw, ImageDown, X } from "lucide-react";
import type { Game as AppGame, GameSystem } from "../../types/library";
import type { ArtworkProgress } from "../../types/artwork";
import type { GamelordAPI } from "../types/global";
import { EmptyLibrary } from "./EmptyLibrary";
import { useMenuEvents } from "../hooks/useMenuEvents";
import { useSfx } from "../hooks/useSfx";

interface CoreDownloadProgress {
  coreName: string;
  systemId: string;
  phase: "downloading" | "extracting" | "done" | "error";
  percent: number;
  error?: string;
}

export const LibraryView: React.FC<{
  onPlayGame: (game: Game, cardRect?: DOMRect) => void;
  getMenuItems?: (game: Game) => Array<GameCardMenuItem>;
  /** ID of a game currently being launched. Shows shimmer on that card and disables others. */
  launchingGameId?: string | null;
  /** Extra actions to show in the command palette (e.g. theme toggles from parent). */
  commandPaletteActions?: Array<CommandAction>;
}> = ({ onPlayGame, getMenuItems, launchingGameId, commandPaletteActions = [] }) => {
  const api = (window as unknown as { gamelord: GamelordAPI }).gamelord;
  const { play: playSfx } = useSfx();
  const playSfxRef = useRef(playSfx);
  playSfxRef.current = playSfx;

  const [games, setGames] = useState<Array<AppGame>>([]);
  const [systems, setSystems] = useState<Array<GameSystem>>([]);
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{
    processed: number;
    total: number;
    skipped: number;
  } | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<CoreDownloadProgress | null>(null);
  /** True while the main process is importing bundled homebrew ROMs on first launch. */
  const [isImportingHomebrew, setIsImportingHomebrew] = useState(true);

  // Artwork sync state — external store so phase updates bypass React re-renders.
  // Each GameCard subscribes to its own phase via useSyncExternalStore.
  const [artworkSyncStore] = useState(() => new ArtworkSyncStore());
  const [syncCounter, setSyncCounter] = useState<{ current: number; total: number } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const phaseCleanupTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  /** Track sync results for the notification summary. */
  const syncResults = useRef<{
    found: number;
    notFound: number;
    errors: number;
    lastErrorCode?: string;
    lastError?: string;
  }>({ found: 0, notFound: 0, errors: 0 });
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false);
  const [credentialUserId, setCredentialUserId] = useState("");
  const [credentialPassword, setCredentialPassword] = useState("");
  const [credentialError, setCredentialError] = useState("");
  const [isValidatingCredentials, setIsValidatingCredentials] = useState(false);
  /** Notification banner shown after sync completes or errors. */
  const [syncNotification, setSyncNotification] = useState<{
    message: string;
    variant: "error" | "warning" | "success";
  } | null>(null);

  // Game options menu state
  const [optionsMenuGame, setOptionsMenuGame] = useState<AppGame | null>(null);
  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false);

  // Command palette state
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        playSfxRef.current(commandPaletteOpen ? "dialogClose" : "dialogOpen");
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commandPaletteOpen]);

  const handleCommandPaletteOpenChange = useCallback((open: boolean) => {
    playSfxRef.current(open ? "dialogOpen" : "dialogClose");
    setCommandPaletteOpen(open);
  }, []);

  /**
   * Set a sync phase for a game card and optionally schedule its cleanup.
   * Terminal phases ('done', 'error', 'not-found') auto-clear after a delay.
   */
  const setCardPhase = useCallback(
    (gameId: string, phase: ArtworkSyncPhase) => {
      // Clear any pending cleanup timer for this card
      const existing = phaseCleanupTimers.current.get(gameId);
      if (existing) {
        clearTimeout(existing);
      }

      artworkSyncStore.setPhase(gameId, phase);

      // Schedule auto-cleanup for terminal states
      if (phase === "done") {
        const timer = setTimeout(() => {
          artworkSyncStore.setPhase(gameId, null);
          phaseCleanupTimers.current.delete(gameId);
        }, 1500); // Hold 'done' for dissolve animation
        phaseCleanupTimers.current.set(gameId, timer);
      } else if (phase === "error") {
        const timer = setTimeout(() => {
          artworkSyncStore.setPhase(gameId, null);
          phaseCleanupTimers.current.delete(gameId);
        }, 2500); // Hold error briefly then revert to idle fallback
        phaseCleanupTimers.current.set(gameId, timer);
      }
      // 'not-found' persists so the user sees "Artwork not found" and doesn't retry.
    },
    [artworkSyncStore],
  );

  useEffect(() => {
    loadLibrary().then((loadedGames) => {
      // If the library already has games (returning user), no need to wait
      // for homebrew import — it won't run anyway. For first-time users with
      // empty libraries, wait for the homebrew import to complete via the
      // library:homebrewImported event to avoid a flash of "empty library" UI.
      if (loadedGames.length > 0) {
        setIsImportingHomebrew(false);
      }
    });

    // Reload library when bundled homebrew ROMs finish importing on first launch
    api.on("library:homebrewImported", () => {
      setIsImportingHomebrew(false);
      loadLibrary();
    });

    api.on(
      "library:scanProgress",
      (progress: {
        game: AppGame;
        isNew: boolean;
        processed: number;
        total: number;
        skipped: number;
      }) => {
        setScanProgress({
          processed: progress.processed,
          total: progress.total,
          skipped: progress.skipped,
        });

        if (progress.isNew) {
          // Incrementally add the new game to the list without waiting for the full scan
          setGames((prev) => {
            // Avoid duplicates — the scan may re-emit known games
            if (prev.some((g) => g.id === progress.game.id)) {
              return prev;
            }
            return [...prev, progress.game];
          });
        }
      },
    );

    api.on("core:downloadProgress", (progress: CoreDownloadProgress) => {
      if (progress.phase === "done") {
        setDownloadProgress(progress);
        setTimeout(() => setDownloadProgress(null), 2000);
      } else {
        setDownloadProgress(progress);
      }
    });

    api.on("artwork:progress", (progress: ArtworkProgress) => {
      // Update per-card sync phase
      setCardPhase(progress.gameId, progress.phase as ArtworkSyncPhase);

      // Update counter for header badge
      setSyncCounter({ current: progress.current, total: progress.total });

      // Track results for summary notification
      if (progress.phase === "done") {
        syncResults.current.found++;
        // Update just this game's coverArt in-place to avoid full library
        // reload, which causes layout reflow and FLIP recalculation jank.
        if (progress.coverArt) {
          setGames((prev) =>
            prev.map((g) =>
              g.id === progress.gameId
                ? {
                    ...g,
                    coverArt: progress.coverArt,
                    coverArtAspectRatio: progress.coverArtAspectRatio,
                  }
                : g,
            ),
          );
        }
      } else if (progress.phase === "not-found") {
        syncResults.current.notFound++;
      } else if (progress.phase === "error") {
        syncResults.current.errors++;
        syncResults.current.lastErrorCode = progress.errorCode;
        syncResults.current.lastError = progress.error;
      }
    });

    api.on("artwork:syncComplete", () => {
      setSyncCounter(null);
      loadLibrary();

      // Show summary notification
      const { found, notFound, errors, lastErrorCode, lastError } = syncResults.current;
      const total = found + notFound + errors;
      if (total > 0) {
        const hasError =
          lastErrorCode === "config-error" ||
          lastErrorCode === "auth-failed" ||
          lastErrorCode === "timeout" ||
          lastErrorCode === "rate-limited" ||
          errors > 0;
        playSfxRef.current(hasError ? "error" : "syncComplete");
        if (lastErrorCode === "config-error") {
          setSyncNotification({
            message: "Artwork sync stopped: developer credentials are missing from the .env file.",
            variant: "error",
          });
        } else if (lastErrorCode === "auth-failed") {
          // Clear bad credentials so the dialog reopens on next attempt
          api.artwork.clearCredentials();
          setSyncNotification({
            message:
              'Artwork sync stopped: invalid ScreenScraper credentials. Click "Download Artwork" to update your account.',
            variant: "error",
          });
        } else if (lastErrorCode === "timeout") {
          setSyncNotification({
            message: "Artwork sync stopped: ScreenScraper is not responding. Try again later.",
            variant: "error",
          });
        } else if (lastErrorCode === "rate-limited") {
          setSyncNotification({
            message:
              "Artwork sync stopped: ScreenScraper is rate limiting requests. Please wait a few minutes and try again.",
            variant: "error",
          });
        } else if (errors > 0) {
          setSyncNotification({
            message: `Artwork sync finished with errors: ${found} found, ${errors} failed${lastError ? ` (${lastError})` : ""}, ${notFound} not in database.`,
            variant: "warning",
          });
        } else if (notFound > 0 && found === 0) {
          setSyncNotification({
            message: `No artwork found. ${notFound} game${notFound === 1 ? "" : "s"} not recognized by ScreenScraper.`,
            variant: "warning",
          });
        } else if (found > 0) {
          setSyncNotification({
            message: `Downloaded artwork for ${found} game${found === 1 ? "" : "s"}.${notFound > 0 ? ` ${notFound} not found.` : ""}`,
            variant: "success",
          });
        }
      }
      // Reset for next sync
      syncResults.current = { found: 0, notFound: 0, errors: 0 };
    });

    api.on("artwork:syncError", (data: { error: string; errorCode?: string }) => {
      setSyncCounter(null);
      artworkSyncStore.clear();
      syncResults.current = { found: 0, notFound: 0, errors: 0 };

      // Show actionable error to the user based on structured error code
      let message: string;
      switch (data.errorCode) {
        case "config-error":
          message = "Artwork sync failed: developer credentials are missing from the .env file.";
          break;
        case "auth-failed":
          message =
            "Artwork sync failed: invalid credentials. Please update your ScreenScraper account settings.";
          break;
        case "rate-limited":
          message =
            "Artwork sync failed: ScreenScraper is rate limiting requests. Try again later.";
          break;
        case "timeout":
          message = "Artwork sync failed: ScreenScraper is not responding. Try again later.";
          break;
        case "network-error":
          message =
            "Artwork sync failed: could not connect to ScreenScraper. Check your internet connection.";
          break;
        default:
          message = `Artwork sync failed: ${data.error}`;
          break;
      }

      setSyncNotification({ message, variant: "error" });
    });

    return () => {
      api.removeAllListeners("library:scanProgress");
      api.removeAllListeners("library:homebrewImported");
      api.removeAllListeners("core:downloadProgress");
      api.removeAllListeners("artwork:progress");
      api.removeAllListeners("artwork:syncComplete");
      api.removeAllListeners("artwork:syncError");
      // Clear all cleanup timers
      phaseCleanupTimers.current.forEach((timer) => clearTimeout(timer));
      phaseCleanupTimers.current.clear();
    };
  }, []);

  const loadLibrary = async (): Promise<Array<AppGame>> => {
    setLoading(true);
    try {
      const [loadedSystems, loadedGames] = await Promise.all([
        api.library.getSystems(),
        api.library.getGames(),
      ]);
      setSystems(loadedSystems);
      setGames(loadedGames);
      return loadedGames;
    } catch (error) {
      console.error("Failed to load library:", error);
      return [];
    } finally {
      setLoading(false);
    }
  };

  /**
   * Auto-sync artwork for newly imported games.
   * Only triggers if the user has configured ScreenScraper credentials.
   */
  const autoSyncNewGames = useCallback(
    async (newGames: Array<AppGame>) => {
      if (newGames.length === 0) {
        return;
      }

      try {
        const { hasCredentials } = await api.artwork.getCredentials();
        if (!hasCredentials) {
          return;
        }

        const gameIds = newGames.map((g) => g.id);
        await api.artwork.syncGames(gameIds);
      } catch (error) {
        console.error("Auto-sync failed:", error);
      }
    },
    [api],
  );

  const handleQuickScan = async () => {
    setIsScanning(true);
    setScanProgress(null);
    try {
      const config = await api.library.getConfig();
      if (!config.romsBasePath) {
        await handleSelectDirectory();
        return;
      }
      const basePath = config.romsBasePath;

      const foundGames = await api.library.scanDirectory(basePath);

      if (foundGames.length > 0) {
        await loadLibrary();
        autoSyncNewGames(foundGames);
      } else {
        await handleSelectDirectory();
      }
    } catch (error) {
      console.error("Quick scan failed:", error);
    } finally {
      setIsScanning(false);
      setScanProgress(null);
    }
  };

  const handleSelectDirectory = async () => {
    const directory = await api.dialog.selectDirectory();
    if (directory) {
      setIsScanning(true);
      setScanProgress(null);
      try {
        const foundGames = await api.library.scanDirectory(directory);
        await loadLibrary();
        autoSyncNewGames(foundGames);
      } catch (error) {
        console.error("Directory scan failed:", error);
      } finally {
        setIsScanning(false);
        setScanProgress(null);
      }
    }
  };

  const handleAddSystem = async (system: GameSystem) => {
    await api.library.addSystem(system);

    const directory = await api.dialog.selectDirectory();
    if (directory) {
      await api.library.updateSystemPath(system.id, directory);

      setIsScanning(true);
      setScanProgress(null);
      try {
        const foundGames = await api.library.scanDirectory(directory, system.id);
        await loadLibrary();
        autoSyncNewGames(foundGames);
      } catch (error) {
        console.error("Failed to scan system directory:", error);
      } finally {
        setIsScanning(false);
        setScanProgress(null);
      }
    }
  };

  const handleScanSystemFolders = async () => {
    setIsScanning(true);
    setScanProgress(null);
    try {
      const foundGames = await api.library.scanSystemFolders();
      await loadLibrary();
      autoSyncNewGames(foundGames);
    } catch (error) {
      console.error("System folder scan failed:", error);
    } finally {
      setIsScanning(false);
      setScanProgress(null);
    }
  };

  // Wire app menu actions to existing handlers
  useMenuEvents(api, {
    onScanLibrary: handleScanSystemFolders,
    onAddRomFolder: handleSelectDirectory,
    onOpenSettings: () => {
      // TODO: open settings panel — https://github.com/ryanmagoon/gamelord/issues/96
      console.log("[menu] Preferences: settings panel not yet implemented");
    },
  });

  const handleAddRom = async (systemId: string) => {
    const romPath = await api.dialog.selectRomFile(systemId);
    if (romPath) {
      const game = await api.library.addGame(romPath, systemId);
      if (game) {
        setGames([...games, game]);
        autoSyncNewGames([game]);
      }
    }
  };

  const isSyncing = syncCounter !== null;

  const handleDownloadArtwork = async () => {
    const { hasCredentials } = await api.artwork.getCredentials();
    if (!hasCredentials) {
      setShowCredentialsDialog(true);
      return;
    }
    // Sort by title so artwork loads in the same order the user sees in the grid
    const sortedIds = [...games].sort((a, b) => a.title.localeCompare(b.title)).map((g) => g.id);
    await api.artwork.syncGames(sortedIds);
  };

  const handleCancelArtworkSync = async () => {
    await api.artwork.cancelSync();
    setSyncCounter(null);
    artworkSyncStore.clear();
  };

  const handleSaveCredentials = async () => {
    if (!credentialUserId || !credentialPassword) {
      setCredentialError("Both username and password are required.");
      return;
    }

    setCredentialError("");
    setIsValidatingCredentials(true);
    try {
      const result = await api.artwork.setCredentials(credentialUserId, credentialPassword);
      if (result.success) {
        setShowCredentialsDialog(false);
        setCredentialUserId("");
        setCredentialPassword("");
        setCredentialError("");
        await api.artwork.syncAll();
      } else {
        // Show specific error messages based on error code
        if (result.errorCode === "config-error") {
          setCredentialError(
            "ScreenScraper API is not configured. Developer credentials are missing from the .env file.",
          );
        } else if (result.errorCode === "auth-failed") {
          setCredentialError(
            "Invalid username or password. Please check your ScreenScraper credentials.",
          );
        } else if (result.errorCode === "timeout") {
          setCredentialError(
            "Could not reach ScreenScraper. The server may be down — try again later.",
          );
        } else if (result.errorCode === "rate-limited") {
          setCredentialError(
            "ScreenScraper is rate limiting requests. Please wait a moment and try again.",
          );
        } else if (result.errorCode === "network-error") {
          setCredentialError(
            "Could not connect to ScreenScraper. Check your internet connection and try again.",
          );
        } else {
          setCredentialError(result.error ?? "Failed to validate credentials.");
        }
      }
    } finally {
      setIsValidatingCredentials(false);
    }
  };

  const handleSyncSingleGame = async (gameId: string) => {
    const { hasCredentials } = await api.artwork.getCredentials();
    if (!hasCredentials) {
      setShowCredentialsDialog(true);
      return;
    }
    const result = await api.artwork.syncGame(gameId);
    if (!result.success) {
      console.error(`Artwork sync failed for game ${gameId}:`, result.error);
    }
    await loadLibrary();
  };

  /** Switches the active system filter. The FLIP hook in GameLibrary handles animation. */
  const switchSystem = useCallback((nextSystem: string | null) => {
    setSelectedSystem(nextSystem);
  }, []);

  const idToGame = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);

  /** Delegate to the parent's onPlayGame so App.tsx can handle core selection. */
  const handlePlayUiGame = (uiGame: UiGame, cardRect?: DOMRect) => {
    onPlayGame(uiGame, cardRect);
  };

  const handleGameOptions = (game: AppGame) => {
    setOptionsMenuGame(game);
    setOptionsMenuOpen(true);
  };

  const handleUiGameOptions = (uiGame: UiGame) => {
    const fullGame = idToGame.get(uiGame.id);
    if (fullGame) {
      handleGameOptions(fullGame);
    }
  };

  const handleRemoveGame = async (gameId: string) => {
    await api.library.removeGame(gameId);
    setOptionsMenuOpen(false);
    await loadLibrary();
  };

  const handleToggleFavorite = useCallback(
    (uiGame: UiGame) => {
      const fullGame = idToGame.get(uiGame.id);
      if (!fullGame) {
        return;
      }
      const nextFavorite = !fullGame.favorite;
      playSfx("favoritePop");
      // Optimistic in-place update (same pattern as artwork update)
      setGames((prev) =>
        prev.map((g) => (g.id === uiGame.id ? { ...g, favorite: nextFavorite } : g)),
      );
      api.library.updateGame(uiGame.id, { favorite: nextFavorite });
    },
    [idToGame, api, playSfx],
  );

  const filteredGames = useMemo(
    () => (selectedSystem ? games.filter((game) => game.systemId === selectedSystem) : games),
    [games, selectedSystem],
  );

  // ---- Graceful reveal ----
  // Reveal #root once the library UI is fully painted. The inline CSS in
  // index.html starts #root at opacity 0; adding .mounted triggers a
  // 300ms CSS transition so the entire UI (titlebar, toolbar, tabs, grid)
  // fades in as one cohesive unit instead of popping in piece by piece.
  //
  // Two conditions gate the reveal:
  //  1. `loading` is false (library data returned from IPC).
  //  2. The grid has measured its container and positioned cards (via the
  //     `onReady` callback from GameLibrary). For virtualized lists the
  //     ResizeObserver fires asynchronously, so without this gate the
  //     #root fade would complete before any cards are in the DOM.
  //
  // For empty libraries (no games), condition 2 is skipped because there
  // is no grid to wait for — the EmptyLibrary component renders instead.
  //
  // `isRevealing` stays true during the fade so GameLibrary can minimise
  // overscan and suppress card transitions, reducing GPU compositing work.
  const hasRevealedRef = useRef(false);
  const [gridReady, setGridReady] = useState(false);
  const [isRevealing, setIsRevealing] = useState(true);
  const handleGridReady = useCallback(() => setGridReady(true), []);

  const shouldReveal = !loading && (gridReady || games.length === 0);

  useEffect(() => {
    if (shouldReveal && !hasRevealedRef.current) {
      hasRevealedRef.current = true;
      // Tell the main process to show the window. This triggers
      // mainWindow.show() which rasterizes the full window surface
      // for the first time — an expensive compositing pass. We give
      // the compositor 2 full frames to settle before starting the
      // opacity fade, otherwise the fade animation drops frames while
      // the GPU is still rasterizing layers.
      api.contentReady();
      // Frame 1: browser composites the newly-shown window surface.
      requestAnimationFrame(() => {
        // Frame 2: first fully-rasterized frame is on screen (at opacity 0).
        requestAnimationFrame(() => {
          // Frame 3: now safe to start the opacity transition.
          requestAnimationFrame(() => {
            document.getElementById("root")?.classList.add("mounted");
            // End reveal mode after the CSS transition completes (400ms) + buffer.
            // This re-enables full overscan and card hover transitions.
            // Also remove will-change to free the dedicated GPU layer.
            setTimeout(() => {
              setIsRevealing(false);
              const root = document.getElementById("root");
              if (root) {
                root.style.willChange = "auto";
              }
            }, 500);
          });
        });
      });
    }
  }, [shouldReveal]);

  // Per-game UI object cache — only recreates a UiGame when its source
  // AppGame object reference changes. This prevents ALL cards from
  // re-rendering when only one game's coverArt is updated.
  const uiGameCacheRef = useRef<Map<AppGame, UiGame>>(new Map());

  const uiGames = useMemo<Array<UiGame>>(() => {
    const cache = uiGameCacheRef.current;
    const nextCache = new Map<AppGame, UiGame>();
    const result: Array<UiGame> = [];

    for (const game of filteredGames) {
      let uiGame = cache.get(game);
      if (!uiGame) {
        uiGame = {
          id: game.id,
          title: game.title,
          platform: game.system,
          systemId: game.systemId,
          genre: game.metadata?.genre,
          coverArt: game.coverArt,
          coverArtAspectRatio: game.coverArtAspectRatio,
          romPath: game.romPath,
          lastPlayed: game.lastPlayed,
          playTime: game.playTime,
          favorite: game.favorite,
        };
      }
      nextCache.set(game, uiGame);
      result.push(uiGame);
    }

    uiGameCacheRef.current = nextCache;
    return result;
  }, [filteredGames]);

  // Build command palette actions: library-level actions + parent-provided actions
  const allPaletteActions = useMemo<Array<CommandAction>>(() => {
    const libraryActions: Array<CommandAction> = [
      {
        id: "scan-library",
        label: "Scan Library",
        group: "Actions",
        icon: <RefreshCw className="h-4 w-4 mr-3 shrink-0 text-muted-foreground" />,
        onSelect: () => void handleScanSystemFolders(),
        keywords: ["rescan", "refresh", "import"],
      },
      {
        id: "add-folder",
        label: "Add Folder",
        group: "Actions",
        icon: <FolderOpen className="h-4 w-4 mr-3 shrink-0 text-muted-foreground" />,
        onSelect: () => void handleSelectDirectory(),
        keywords: ["browse", "directory", "import"],
      },
      {
        id: "download-artwork",
        label: "Download Artwork",
        group: "Actions",
        icon: <ImageDown className="h-4 w-4 mr-3 shrink-0 text-muted-foreground" />,
        onSelect: () => void handleDownloadArtwork(),
        keywords: ["art", "cover", "metadata", "sync"],
      },
    ];
    return [...libraryActions, ...commandPaletteActions];
  }, [commandPaletteActions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (games.length === 0 && !isScanning) {
    return (
      <div
        className="h-full"
        style={{
          opacity: shouldReveal ? 1 : 0,
          transition: "opacity 250ms ease",
        }}
      >
        <EmptyLibrary
          onAddSystem={handleAddSystem}
          onScanDirectory={handleSelectDirectory}
          onQuickScan={handleQuickScan}
          availableSystems={systems.length > 0 ? systems : []}
          isImportingHomebrew={isImportingHomebrew}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Library</h1>
          {isScanning && (
            <Badge variant="secondary" className="animate-pulse">
              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              {scanProgress
                ? `Scanning ${scanProgress.processed}/${scanProgress.total}${scanProgress.skipped > 0 ? ` (${scanProgress.skipped} cached)` : ""}`
                : "Scanning..."}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Sync progress badge — replaces the old purple banner */}
          {isSyncing && (
            <Badge variant="secondary" className="gap-1.5 text-xs font-normal">
              <ImageDown className="h-3 w-3 animate-pulse" />
              Syncing {syncCounter.current}/{syncCounter.total}
              <button
                onClick={handleCancelArtworkSync}
                className="ml-1 hover:text-destructive transition-colors"
                aria-label="Cancel artwork sync"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={handleDownloadArtwork} disabled={isSyncing}>
            <ImageDown className="h-4 w-4 mr-2" />
            Download Artwork
          </Button>
          <Button variant="outline" size="sm" onClick={handleSelectDirectory}>
            <FolderOpen className="h-4 w-4 mr-2" />
            Add Folder
          </Button>
          <Button variant="outline" size="sm" onClick={handleScanSystemFolders}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Rescan
          </Button>
        </div>
      </div>

      {/* Sync result notification */}
      {syncNotification && (
        <div
          className={cn(
            "flex items-center gap-3 px-4 py-3 border-b text-sm",
            syncNotification.variant === "error" && "bg-destructive/10 text-destructive",
            syncNotification.variant === "warning" &&
              "bg-amber-500/10 text-amber-700 dark:text-amber-400",
            syncNotification.variant === "success" &&
              "bg-green-500/10 text-green-700 dark:text-green-400",
          )}
        >
          <span className="flex-1">{syncNotification.message}</span>
          <button
            onClick={() => setSyncNotification(null)}
            className="hover:opacity-70 transition-opacity"
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Core download progress */}
      {downloadProgress && downloadProgress.phase !== "done" && (
        <CoreDownloadBanner
          coreName={downloadProgress.coreName}
          phase={downloadProgress.phase}
          percent={downloadProgress.percent}
          onRetry={() => {
            setDownloadProgress(null);
            api.emulator.downloadCore(downloadProgress.coreName, downloadProgress.systemId);
          }}
          onDismiss={() => setDownloadProgress(null)}
        />
      )}

      {/* System filter tabs */}
      {systems.length > 0 && (
        <div className="flex gap-2 p-4 border-b overflow-x-auto">
          <Button
            variant={selectedSystem === null ? "default" : "outline"}
            size="sm"
            onClick={() => switchSystem(null)}
          >
            All ({games.length})
          </Button>
          {systems.map((system) => {
            const systemGames = games.filter((g) => g.systemId === system.id);
            return (
              <Button
                key={system.id}
                variant={selectedSystem === system.id ? "default" : "outline"}
                size="sm"
                onClick={() => switchSystem(system.id)}
              >
                {system.shortName} ({systemGames.length})
              </Button>
            );
          })}
        </div>
      )}

      {/* Game library */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto overscroll-contain p-4"
        style={{ scrollbarGutter: "stable" }}
      >
        {filteredGames.length > 0 ? (
          <GameLibrary
            games={uiGames}
            onPlayGame={(g, cardRect) => {
              void handlePlayUiGame(g, cardRect);
            }}
            onGameOptions={handleUiGameOptions}
            getMenuItems={getMenuItems}
            onToggleFavorite={handleToggleFavorite}
            artworkSyncStore={artworkSyncStore}
            launchingGameId={launchingGameId}
            scrollContainerRef={scrollContainerRef}
            onReady={handleGridReady}
            isRevealing={isRevealing}
            onSearchClick={() => handleCommandPaletteOpenChange(true)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-muted-foreground mb-4">No games found for this system</p>
            {selectedSystem && (
              <Button variant="outline" onClick={() => handleAddRom(selectedSystem)}>
                <Plus className="h-4 w-4 mr-2" />
                Add ROM
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Game options dialog */}
      <AlertDialog
        open={optionsMenuOpen}
        onOpenChange={(open) => {
          if (!open) {
            setOptionsMenuOpen(false);
          }
        }}
      >
        <AlertDialogContent className="max-w-xs">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">{optionsMenuGame?.title}</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1">
            <Button
              variant="ghost"
              className="justify-start"
              onClick={() => {
                const gameId = optionsMenuGame?.id;
                setOptionsMenuOpen(false);
                if (gameId) {
                  handleSyncSingleGame(gameId);
                }
              }}
            >
              <ImageDown className="h-4 w-4 mr-2" />
              Download Artwork
            </Button>
            <Button
              variant="ghost"
              className="justify-start text-destructive hover:text-destructive"
              onClick={() => {
                if (optionsMenuGame) {
                  handleRemoveGame(optionsMenuGame.id);
                }
              }}
            >
              <X className="h-4 w-4 mr-2" />
              Remove from Library
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Command palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={handleCommandPaletteOpenChange}
        games={uiGames}
        onSelectGame={(game) => void handlePlayUiGame(game)}
        actions={allPaletteActions}
      />

      {/* ScreenScraper credentials dialog */}
      <AlertDialog open={showCredentialsDialog} onOpenChange={setShowCredentialsDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ScreenScraper Account</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  GameLord uses ScreenScraper to download cover art and game metadata. Enter your
                  free account credentials to get started.
                </p>
                <p className="text-xs">Don&apos;t have an account? Register at screenscraper.fr</p>
                <div className="space-y-2">
                  <Input
                    placeholder="Username"
                    value={credentialUserId}
                    onChange={(e) => setCredentialUserId(e.target.value)}
                  />
                  <Input
                    type="password"
                    placeholder="Password"
                    value={credentialPassword}
                    onChange={(e) => setCredentialPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleSaveCredentials();
                      }
                    }}
                  />
                  {credentialError && <p className="text-sm text-destructive">{credentialError}</p>}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setCredentialUserId("");
                setCredentialPassword("");
                setCredentialError("");
              }}
            >
              Cancel
            </AlertDialogCancel>
            {/* Use a regular Button instead of AlertDialogAction to prevent
                the dialog from auto-closing when validation fails. */}
            <Button onClick={handleSaveCredentials} disabled={isValidatingCredentials}>
              {isValidatingCredentials ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Validating...
                </>
              ) : (
                "Save & Download"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
