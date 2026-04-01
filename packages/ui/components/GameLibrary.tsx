import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { GameCard, Game, GameCardMenuItem } from "./GameCard";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Search, Filter, Grid, List, Heart, Disc2 } from "lucide-react";
import { cn } from "../utils";

/** A purely-UI placeholder representing a missing disc in an incomplete set. */
interface DiscPlaceholder {
  kind: "placeholder";
  /** The discGroup this placeholder belongs to. */
  discGroup: string;
  /** The missing disc number (1-indexed). */
  discNumber: number;
  /** Total discs in this group. */
  discTotal: number;
  /** Stable key for React rendering. */
  id: string;
}

type DisplayItem = { kind: "game"; game: Game } | DiscPlaceholder;

/** Ghost card rendered for missing discs in an incomplete multi-disc set. */
function DiscPlaceholderCard({ discNumber, discTotal }: { discNumber: number; discTotal: number }) {
  return (
    <div
      aria-label={`Disc ${discNumber} — Missing`}
      className="w-full h-full rounded-none border-2 border-dashed border-white/20 bg-muted/30 opacity-50 flex flex-col items-center justify-center gap-2 select-none"
    >
      <Disc2 className="h-8 w-8 text-white/30" />
      <span className="text-xs font-semibold text-white/40 text-center leading-tight px-2">
        Disc {discNumber}/{discTotal}
        <br />
        <span className="text-[10px] font-normal uppercase tracking-wider text-white/30">
          Missing
        </span>
      </span>
    </div>
  );
}
import { useFlipAnimation } from "../hooks/useFlipAnimation";
import { useScrollContainer } from "../hooks/useScrollContainer";
import { useMosaicVirtualizer } from "../hooks/useMosaicVirtualizer";
import { useScrollLetterIndicator } from "../hooks/useScrollLetterIndicator";
import { ScrollLetterIndicator } from "./ScrollLetterIndicator";
import type { ArtworkSyncStore } from "../hooks/useArtworkSyncStore";
import { modifierKey } from "../hooks/usePlatform";
import { ROW_HEIGHT, MOSAIC_GAP, computeCardWidth } from "../utils/mosaicGrid";
import { computeRowLayout } from "../utils/mosaicLayout";

/** Threshold: lists larger than this use virtualized rendering. */
const VIRTUALIZATION_THRESHOLD = 100;

export interface GameLibraryProps {
  /** External store for per-game artwork sync phases. Each card subscribes to its own phase. */
  artworkSyncStore?: ArtworkSyncStore;
  className?: string;
  games: Array<Game>;
  /** Returns menu items for a specific game's dropdown. */
  getMenuItems?: (game: Game) => Array<GameCardMenuItem>;
  /** ID of a game currently being launched. Shows shimmer on that card and disables others. */
  launchingGameId?: string | null;
  onGameOptions?: (game: Game) => void;
  onPlayGame: (game: Game, cardRect?: DOMRect) => void;
  /** Called when the user toggles the favorite heart on a card. */
  onToggleFavorite?: (game: Game) => void;
  /** Ref to the scrollable container (for virtualization). */
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  /**
   * Called once after the grid has measured its container and computed
   * layout positions for the first time. The host can use this to defer
   * reveal transitions until cards are actually in the DOM.
   */
  onReady?: () => void;
  /**
   * When true, the grid is in "initial reveal" mode: overscan is minimised
   * and card hover transitions are suppressed to reduce GPU work during
   * the #root opacity fade. Set to false after the fade completes.
   */
  isRevealing?: boolean;
  /**
   * When provided, replaces the inline search input with a clickable
   * Cmd+K trigger button that calls this callback on click.
   */
  onSearchClick?: () => void;
}

type ViewMode = "grid" | "list";
type SortBy = "title" | "platform" | "lastPlayed" | "recent";

/** Measures the grid container width via ResizeObserver. */
function useContainerWidth(gridRef: React.RefObject<HTMLDivElement | null>): number {
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) {
      return;
    }

    const observer = new ResizeObserver(() => {
      setContainerWidth(grid.clientWidth);
    });

    observer.observe(grid);
    return () => observer.disconnect();
  }, [gridRef]);

  return containerWidth;
}

export const GameLibrary: React.FC<GameLibraryProps> = ({
  artworkSyncStore,
  className,
  games,
  getMenuItems,
  launchingGameId,
  onGameOptions,
  onPlayGame,
  onToggleFavorite,
  scrollContainerRef,
  onReady,
  isRevealing,
  onSearchClick,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortBy>("title");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const gridRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(gridRef);
  const getGameKey = useCallback((game: Game) => game.id, []);

  // Extract unique platforms
  const platforms = useMemo(() => {
    const platformSet = new Set(games.map((game) => game.platform));
    return Array.from(platformSet).sort();
  }, [games]);

  // Filter and sort games
  const filteredGames = useMemo(() => {
    let filtered = games;

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter((game) =>
        game.title.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }

    // Platform filter
    if (selectedPlatform !== "all") {
      filtered = filtered.filter((game) => game.platform === selectedPlatform);
    }

    // Favorites filter
    if (showFavoritesOnly) {
      filtered = filtered.filter((game) => game.favorite);
    }

    // Sort — disc groups are always kept consecutive and ordered by discNumber
    // within whatever primary sort is applied.
    switch (sortBy) {
      case "title":
        filtered = [...filtered].sort((a, b) => {
          // Sort key for grouping: prefer discGroup (shared across discs), else title
          const keyA = a.discGroup ?? a.title;
          const keyB = b.discGroup ?? b.title;
          const groupCmp = keyA.localeCompare(keyB);
          if (groupCmp !== 0) {
            return groupCmp;
          }
          // Within the same disc group, order by disc number
          return (a.discNumber ?? 0) - (b.discNumber ?? 0);
        });
        break;
      case "platform":
        filtered = [...filtered].sort((a, b) => {
          const platformCmp = a.platform.localeCompare(b.platform);
          if (platformCmp !== 0) {
            return platformCmp;
          }
          const keyA = a.discGroup ?? a.title;
          const keyB = b.discGroup ?? b.title;
          const groupCmp = keyA.localeCompare(keyB);
          if (groupCmp !== 0) {
            return groupCmp;
          }
          return (a.discNumber ?? 0) - (b.discNumber ?? 0);
        });
        break;
      case "lastPlayed":
        filtered = [...filtered].sort((a, b) => {
          if (!a.lastPlayed) {
            return 1;
          }
          if (!b.lastPlayed) {
            return -1;
          }
          return b.lastPlayed.getTime() - a.lastPlayed.getTime();
        });
        break;
      case "recent":
        filtered = [...filtered].reverse();
        break;
    }

    return filtered;
  }, [games, searchQuery, selectedPlatform, sortBy, showFavoritesOnly]);

  // Build display items: real games interspersed with placeholder cards for missing discs.
  // Placeholders are purely UI — they don't affect filteredGames (used for FLIP/virtualization keys).
  const displayItems = useMemo((): Array<DisplayItem> => {
    const items: Array<DisplayItem> = [];
    let i = 0;
    while (i < filteredGames.length) {
      const game = filteredGames[i];
      if (game.discGroup == null || game.discNumber == null || game.discTotal == null) {
        items.push({ kind: "game", game });
        i++;
        continue;
      }

      // Collect all consecutive games in this disc group
      const group = game.discGroup;
      const total = game.discTotal;
      const groupGames: Array<Game> = [];
      let j = i;
      while (j < filteredGames.length && filteredGames[j].discGroup === group) {
        groupGames.push(filteredGames[j]);
        j++;
      }

      // Build a map: discNumber → game for this group
      const byDisc = new Map<number, Game>();
      for (const g of groupGames) {
        if (g.discNumber != null) {
          byDisc.set(g.discNumber, g);
        }
      }

      // Emit discs 1..total in order, inserting placeholders for missing ones
      for (let disc = 1; disc <= total; disc++) {
        const found = byDisc.get(disc);
        if (found != null) {
          items.push({ kind: "game", game: found });
        } else {
          items.push({
            kind: "placeholder",
            discGroup: group,
            discNumber: disc,
            discTotal: total,
            id: `placeholder-${group}-${disc}`,
          });
        }
      }

      i = j;
    }

    return items;
  }, [filteredGames]);

  // Median aspect ratio per platform — used as fallback for games without cover art
  // so fallback cards match the width of their platform neighbors.
  const platformMedianAR = useMemo(() => {
    const byPlatform = new Map<string, Array<number>>();
    for (const game of games) {
      if (game.coverArtAspectRatio != null) {
        let list = byPlatform.get(game.platform);
        if (!list) {
          list = [];
          byPlatform.set(game.platform, list);
        }
        list.push(game.coverArtAspectRatio);
      }
    }
    const medians = new Map<string, number>();
    for (const [platform, ratios] of byPlatform) {
      ratios.sort((a, b) => a - b);
      const mid = Math.floor(ratios.length / 2);
      medians.set(
        platform,
        ratios.length % 2 === 0 ? (ratios[mid - 1] + ratios[mid]) / 2 : ratios[mid],
      );
    }
    return medians;
  }, [games]);

  const isLargeList = displayItems.length > VIRTUALIZATION_THRESHOLD;

  // ---- FLIP animation (small lists only) ----
  // FLIP only tracks real Game objects; placeholders appear/disappear with the group.
  const flipGames = useMemo(() => (isLargeList ? [] : filteredGames), [isLargeList, filteredGames]);
  const flipItems = useFlipAnimation(flipGames, getGameKey, { gridRef });

  // ---- Row layout (used by both small and large list paths) ----
  const aspectRatios = useMemo(() => {
    return displayItems.map((item) => {
      if (item.kind === "placeholder") {
        return 0.75;
      }
      return item.game.coverArtAspectRatio ?? platformMedianAR.get(item.game.platform) ?? 0.75;
    });
  }, [displayItems, platformMedianAR]);

  const layout = useMemo(() => {
    if (aspectRatios.length === 0 || containerWidth <= 0) {
      return { items: [], totalHeight: 0 };
    }
    return computeRowLayout(aspectRatios, containerWidth);
  }, [aspectRatios, containerWidth]);

  const { scrollTop, viewportHeight } = useScrollContainer(scrollContainerRef);

  const gridOffsetTop = gridRef.current?.offsetTop ?? 0;
  const gridRelativeScrollTop = Math.max(0, scrollTop - gridOffsetTop);

  // During the initial reveal fade, minimise overscan so the browser
  // only paints the cards actually visible in the viewport. This reduces
  // GPU compositing work (fewer cards = fewer layers + transitions).
  // After the fade completes, bump to the normal 1500px for smooth scrolling.
  const { totalHeight, visibleIndices } = useMosaicVirtualizer({
    layout,
    scrollTop: gridRelativeScrollTop,
    viewportHeight,
    overscan: isRevealing ? 200 : 1500,
  });

  // Signal the host that the grid has cards ready to paint. For large
  // (virtualized) lists this waits until visibleIndices is populated,
  // which requires both container measurement AND viewport height. For
  // small (FLIP) lists, flipItems is available immediately.
  const hasSignalledReady = useRef(false);
  const cardsReady = isLargeList ? visibleIndices.length > 0 : flipItems.length > 0;
  useEffect(() => {
    if (!hasSignalledReady.current && cardsReady) {
      hasSignalledReady.current = true;
      onReady?.();
    }
  }, [cardsReady, onReady]);

  // Scroll to top on filter/sort changes (large lists).
  // Track the actual filter criteria — NOT the filteredGames array reference,
  // which also changes when a single game's coverArt updates in-place.
  const prevFilterKeyRef = useRef("");
  const [enterGeneration, setEnterGeneration] = useState(0);

  useEffect(() => {
    const filterKey = `${searchQuery}|${selectedPlatform}|${sortBy}|${showFavoritesOnly}`;
    if (filterKey !== prevFilterKeyRef.current) {
      const isInitial = prevFilterKeyRef.current === "";
      prevFilterKeyRef.current = filterKey;
      if (!isInitial && isLargeList) {
        scrollContainerRef?.current?.scrollTo({ top: 0 });
        setEnterGeneration((g) => g + 1);
      }
    }
  }, [searchQuery, selectedPlatform, sortBy, showFavoritesOnly, isLargeList, scrollContainerRef]);

  // Clear entrance animation flag after stagger completes
  const [showEntrance, setShowEntrance] = useState(false);
  useEffect(() => {
    if (enterGeneration === 0) {
      return;
    }
    setShowEntrance(true);
    const timer = setTimeout(() => setShowEntrance(false), 600);
    return () => clearTimeout(timer);
  }, [enterGeneration]);

  // ---- Scroll letter indicator (Steam-style) ----
  let firstVisibleIndex: number;
  if (isLargeList) {
    firstVisibleIndex = visibleIndices[0] ?? -1;
  } else {
    firstVisibleIndex = 0;
    const grid = gridRef.current;
    const container = scrollContainerRef?.current;
    if (grid && container) {
      const containerTop = container.getBoundingClientRect().top;
      const children = grid.children;
      for (let i = 0; i < children.length; i++) {
        const child = children[i] as HTMLElement;
        if (child.getBoundingClientRect().bottom > containerTop) {
          firstVisibleIndex = i;
          break;
        }
      }
    }
  }

  const { isVisible: isLetterVisible, letter } = useScrollLetterIndicator({
    firstVisibleIndex,
    games: filteredGames,
    scrollTop,
    sortBy,
  });

  return (
    <div className={cn(className)}>
      {/* Header Controls — sticky so they stay visible while scrolling.
         Negative margins extend the opaque bg to the scroll container edges.
         The parent scroll container needs `relative z-0` to contain card
         z-indices so they don't escape above the header/system tabs. */}
      <div className="sticky -top-4 z-20 bg-background -mx-4 px-4 pt-4 pb-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search — either inline input or Cmd+K trigger */}
          {onSearchClick ? (
            <button
              type="button"
              onClick={onSearchClick}
              className="relative flex-1 flex items-center gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span>Search games...</span>
              <kbd className="ml-auto hidden shrink-0 select-none rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium sm:inline-block">
                {modifierKey()}K
              </kbd>
            </button>
          ) : (
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10"
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search games..."
                value={searchQuery}
              />
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-2">
            <Select onValueChange={setSelectedPlatform} value={selectedPlatform}>
              <SelectTrigger className="w-[140px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                {platforms.map((platform) => (
                  <SelectItem key={platform} value={platform}>
                    {platform}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select onValueChange={(value) => setSortBy(value as SortBy)} value={sortBy}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="title">Title</SelectItem>
                <SelectItem value="platform">Platform</SelectItem>
                <SelectItem value="lastPlayed">Last Played</SelectItem>
                <SelectItem value="recent">Recently Added</SelectItem>
              </SelectContent>
            </Select>

            {/* Favorites filter toggle */}
            <Button
              aria-label={showFavoritesOnly ? "Show all games" : "Show favorites only"}
              onClick={() => setShowFavoritesOnly((prev) => !prev)}
              size="icon"
              title={showFavoritesOnly ? "Show all games" : "Show favorites only"}
              variant={showFavoritesOnly ? "default" : "ghost"}
            >
              <Heart className={cn("h-4 w-4", showFavoritesOnly && "fill-current")} />
            </Button>

            {/* View mode toggle */}
            <div className="flex border rounded-md">
              <Button
                className="rounded-r-none"
                onClick={() => setViewMode("grid")}
                size="icon"
                variant={viewMode === "grid" ? "default" : "ghost"}
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                className="rounded-l-none"
                onClick={() => setViewMode("list")}
                size="icon"
                variant={viewMode === "list" ? "default" : "ghost"}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Results count */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {filteredGames.length} {filteredGames.length === 1 ? "game" : "games"}
          </p>
          <div className="flex items-center gap-2">
            {selectedPlatform !== "all" && (
              <Badge
                className="cursor-pointer"
                onClick={() => setSelectedPlatform("all")}
                variant="secondary"
              >
                {selectedPlatform} ✕
              </Badge>
            )}
            {showFavoritesOnly && (
              <Badge
                className="cursor-pointer"
                onClick={() => setShowFavoritesOnly(false)}
                variant="secondary"
              >
                Favorites ✕
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Games Grid/List */}
      {viewMode === "grid" ? (
        isLargeList ? (
          /* ---- Virtualized path (>100 items) ---- */
          <div
            className="relative mt-6"
            ref={gridRef}
            style={{ height: totalHeight > 0 ? totalHeight : undefined }}
          >
            {visibleIndices.map((index, visibleIndex) => {
              const item = displayItems[index];
              const pos = layout.items[index];
              if (!item || !pos) {
                return null;
              }
              const isEntering = showEntrance && visibleIndex < 30;
              const posStyle: React.CSSProperties = {
                height: pos.height,
                left: pos.x,
                position: "absolute",
                top: pos.y,
                width: pos.width,
              };

              if (item.kind === "placeholder") {
                return (
                  <div
                    className={cn(isEntering && "animate-card-enter")}
                    key={item.id}
                    style={{
                      ...posStyle,
                      ...(isEntering
                        ? { animationDelay: `${Math.min(visibleIndex * 30, 400)}ms` }
                        : undefined),
                    }}
                  >
                    <DiscPlaceholderCard discNumber={item.discNumber} discTotal={item.discTotal} />
                  </div>
                );
              }

              const { game } = item;
              return (
                <GameCard
                  artworkSyncStore={artworkSyncStore}
                  className={cn(
                    isEntering && "animate-card-enter",
                    isRevealing && "game-card-revealing",
                  )}
                  disabled={launchingGameId != null && launchingGameId !== game.id}
                  game={game}
                  getMenuItems={getMenuItems}
                  isLaunching={launchingGameId === game.id}
                  key={game.id}
                  onOptions={onGameOptions}
                  onPlay={onPlayGame}
                  onToggleFavorite={onToggleFavorite}
                  style={{
                    ...posStyle,
                    ...(isEntering
                      ? { animationDelay: `${Math.min(visibleIndex * 30, 400)}ms` }
                      : undefined),
                  }}
                />
              );
            })}
          </div>
        ) : (
          /* ---- Small-list path (<=100 items, with FLIP animations) ---- */
          <div
            className="relative flex flex-wrap mt-6"
            ref={gridRef}
            style={{ gap: `${MOSAIC_GAP}px` }}
          >
            {displayItems.map((item, displayIndex) => {
              if (item.kind === "placeholder") {
                const pos = layout.items[displayIndex];
                return (
                  <div
                    className="animate-card-enter"
                    key={item.id}
                    style={{
                      height: pos?.height ?? ROW_HEIGHT,
                      width: pos?.width ?? computeCardWidth(0.75),
                    }}
                  >
                    <DiscPlaceholderCard discNumber={item.discNumber} discTotal={item.discTotal} />
                  </div>
                );
              }

              const { game } = item;
              const flipItem = flipItems.find((fi) => fi.item === game);
              const layoutIndex = displayIndex;
              const pos = layout.items[layoutIndex];
              const aspectRatio =
                game.coverArtAspectRatio ?? platformMedianAR.get(game.platform) ?? 0.75;

              if (!flipItem) {
                return null;
              }

              return (
                <GameCard
                  artworkSyncStore={artworkSyncStore}
                  className={cn(
                    flipItem.animationState === "entering" && "animate-card-enter",
                    flipItem.animationState === "exiting" && "animate-card-exit",
                  )}
                  disabled={launchingGameId != null && launchingGameId !== game.id}
                  game={game}
                  getMenuItems={getMenuItems}
                  isLaunching={launchingGameId === game.id}
                  key={flipItem.key}
                  onOptions={onGameOptions}
                  onPlay={onPlayGame}
                  onToggleFavorite={onToggleFavorite}
                  ref={flipItem.ref}
                  style={{
                    ...flipItem.style,
                    height: pos?.height ?? ROW_HEIGHT,
                    width: pos?.width ?? computeCardWidth(aspectRatio),
                  }}
                />
              );
            })}
          </div>
        )
      ) : (
        <div className="space-y-2 mt-6">
          {/* List view implementation would go here */}
          <p className="text-muted-foreground">List view coming soon...</p>
        </div>
      )}

      {/* Scroll letter indicator (Steam-style) */}
      <ScrollLetterIndicator isVisible={isLetterVisible} letter={letter} />

      {/* Empty state */}
      {filteredGames.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-2">No games found</p>
          {searchQuery && (
            <Button onClick={() => setSearchQuery("")} variant="ghost">
              Clear search
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
