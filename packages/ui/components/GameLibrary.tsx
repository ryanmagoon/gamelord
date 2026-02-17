import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { GameCard, Game, GameCardMenuItem } from './GameCard';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Search, Filter, Grid, List } from 'lucide-react';
import { cn } from '../utils';
import { useFlipAnimation } from '../hooks/useFlipAnimation';
import { useScrollContainer } from '../hooks/useScrollContainer';
import { useMosaicVirtualizer } from '../hooks/useMosaicVirtualizer';
import { useScrollLetterIndicator } from '../hooks/useScrollLetterIndicator';
import { ScrollLetterIndicator } from './ScrollLetterIndicator';
import type { ArtworkSyncStore } from '../hooks/useArtworkSyncStore';
import { ROW_HEIGHT, MOSAIC_GAP, computeCardWidth } from '../utils/mosaicGrid';
import { computeRowLayout } from '../utils/mosaicLayout';

/** Threshold: lists larger than this use virtualized rendering. */
const VIRTUALIZATION_THRESHOLD = 100;

export interface GameLibraryProps {
  games: Game[];
  onPlayGame: (game: Game, cardRect?: DOMRect) => void;
  onGameOptions?: (game: Game) => void;
  /** Returns menu items for a specific game's dropdown. */
  getMenuItems?: (game: Game) => GameCardMenuItem[];
  /** External store for per-game artwork sync phases. Each card subscribes to its own phase. */
  artworkSyncStore?: ArtworkSyncStore;
  /** ID of a game currently being launched. Shows shimmer on that card and disables others. */
  launchingGameId?: string | null;
  /** Ref to the scrollable container (for virtualization). */
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  className?: string;
}

type ViewMode = 'grid' | 'list';
type SortBy = 'title' | 'platform' | 'lastPlayed' | 'recent';

/** Measures the grid container width via ResizeObserver. */
function useContainerWidth(
  gridRef: React.RefObject<HTMLDivElement | null>,
): number {
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const observer = new ResizeObserver(() => {
      setContainerWidth(grid.clientWidth);
    });

    observer.observe(grid);
    return () => observer.disconnect();
  }, [gridRef]);

  return containerWidth;
}

export const GameLibrary: React.FC<GameLibraryProps> = ({
  games,
  onPlayGame,
  onGameOptions,
  getMenuItems,
  artworkSyncStore,
  launchingGameId,
  scrollContainerRef,
  className
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortBy>('title');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const gridRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(gridRef);
  const getGameKey = useCallback((game: Game) => game.id, []);

  // Extract unique platforms
  const platforms = useMemo(() => {
    const platformSet = new Set(games.map(game => game.platform));
    return Array.from(platformSet).sort();
  }, [games]);

  // Filter and sort games
  const filteredGames = useMemo(() => {
    let filtered = games;

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(game =>
        game.title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Platform filter
    if (selectedPlatform !== 'all') {
      filtered = filtered.filter(game => game.platform === selectedPlatform);
    }

    // Sort
    switch (sortBy) {
      case 'title':
        filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'platform':
        filtered = [...filtered].sort((a, b) => a.platform.localeCompare(b.platform));
        break;
      case 'lastPlayed':
        filtered = [...filtered].sort((a, b) => {
          if (!a.lastPlayed) return 1;
          if (!b.lastPlayed) return -1;
          return b.lastPlayed.getTime() - a.lastPlayed.getTime();
        });
        break;
      case 'recent':
        filtered = [...filtered].reverse();
        break;
    }

    return filtered;
  }, [games, searchQuery, selectedPlatform, sortBy]);

  // Median aspect ratio per platform — used as fallback for games without cover art
  // so fallback cards match the width of their platform neighbors.
  const platformMedianAR = useMemo(() => {
    const byPlatform = new Map<string, number[]>();
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
      medians.set(platform, ratios.length % 2 === 0
        ? (ratios[mid - 1] + ratios[mid]) / 2
        : ratios[mid]);
    }
    return medians;
  }, [games]);

  const isLargeList = filteredGames.length > VIRTUALIZATION_THRESHOLD;

  // ---- FLIP animation (small lists only) ----
  const flipItems = useFlipAnimation(
    isLargeList ? [] : filteredGames,
    getGameKey,
    { gridRef },
  );

  // ---- Row layout (used by both small and large list paths) ----
  const aspectRatios = useMemo(() => {
    return filteredGames.map(game =>
      game.coverArtAspectRatio ?? platformMedianAR.get(game.platform) ?? 0.75
    );
  }, [filteredGames, platformMedianAR]);

  const layout = useMemo(() => {
    if (aspectRatios.length === 0 || containerWidth <= 0) {
      return { items: [], totalHeight: 0 };
    }
    return computeRowLayout(aspectRatios, containerWidth);
  }, [aspectRatios, containerWidth]);

  const { scrollTop, viewportHeight } = useScrollContainer(scrollContainerRef);

  const gridOffsetTop = gridRef.current?.offsetTop ?? 0;
  const gridRelativeScrollTop = Math.max(0, scrollTop - gridOffsetTop);

  const { visibleIndices, totalHeight } = useMosaicVirtualizer({
    layout,
    scrollTop: gridRelativeScrollTop,
    viewportHeight,
  });

  // Scroll to top on filter/sort changes (large lists).
  // Track the actual filter criteria — NOT the filteredGames array reference,
  // which also changes when a single game's coverArt updates in-place.
  const prevFilterKeyRef = useRef('');
  const [enterGeneration, setEnterGeneration] = useState(0);

  useEffect(() => {
    const filterKey = `${searchQuery}|${selectedPlatform}|${sortBy}`;
    if (filterKey !== prevFilterKeyRef.current) {
      const isInitial = prevFilterKeyRef.current === '';
      prevFilterKeyRef.current = filterKey;
      if (!isInitial && isLargeList) {
        scrollContainerRef?.current?.scrollTo({ top: 0 });
        setEnterGeneration(g => g + 1);
      }
    }
  }, [searchQuery, selectedPlatform, sortBy, isLargeList, scrollContainerRef]);

  // Clear entrance animation flag after stagger completes
  const [showEntrance, setShowEntrance] = useState(false);
  useEffect(() => {
    if (enterGeneration === 0) return;
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

  const { letter, isVisible: isLetterVisible } = useScrollLetterIndicator({
    firstVisibleIndex,
    games: filteredGames,
    sortBy,
    scrollTop,
  });

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search games..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
            <SelectTrigger className="w-[140px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Platforms</SelectItem>
              {platforms.map(platform => (
                <SelectItem key={platform} value={platform}>
                  {platform}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortBy)}>
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

          {/* View mode toggle */}
          <div className="flex border rounded-md">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="icon"
              onClick={() => setViewMode('grid')}
              className="rounded-r-none"
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="icon"
              onClick={() => setViewMode('list')}
              className="rounded-l-none"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filteredGames.length} {filteredGames.length === 1 ? 'game' : 'games'}
        </p>
        {selectedPlatform !== 'all' && (
          <Badge variant="secondary" className="cursor-pointer" onClick={() => setSelectedPlatform('all')}>
            {selectedPlatform} ✕
          </Badge>
        )}
      </div>

      {/* Games Grid/List */}
      {viewMode === 'grid' ? (
        isLargeList ? (
          /* ---- Virtualized path (>100 items) ---- */
          <div
            ref={gridRef}
            className="relative"
            style={{ height: totalHeight > 0 ? totalHeight : undefined }}
          >
            {visibleIndices.map((index, visibleIndex) => {
              const game = filteredGames[index];
              const pos = layout.items[index];
              if (!pos) return null;
              const isEntering = showEntrance && visibleIndex < 30;

              return (
                <GameCard
                  key={game.id}
                  game={game}
                  onPlay={onPlayGame}
                  onOptions={onGameOptions}
                  getMenuItems={getMenuItems}
                  artworkSyncStore={artworkSyncStore}
                  isLaunching={launchingGameId === game.id}
                  disabled={launchingGameId != null && launchingGameId !== game.id}
                  className={cn(isEntering && 'animate-card-enter')}
                  style={{
                    position: 'absolute',
                    left: pos.x,
                    top: pos.y,
                    width: pos.width,
                    height: pos.height,
                    ...(isEntering ? { animationDelay: `${Math.min(visibleIndex * 30, 400)}ms` } : undefined),
                  }}
                />
              );
            })}
          </div>
        ) : (
          /* ---- Small-list path (<=100 items, with FLIP animations) ---- */
          <div
            ref={gridRef}
            className="relative flex flex-wrap"
            style={{ gap: `${MOSAIC_GAP}px` }}
          >
            {flipItems.map((flipItem) => {
              const layoutIndex = filteredGames.indexOf(flipItem.item);
              const pos = layoutIndex >= 0 ? layout.items[layoutIndex] : undefined;
              const aspectRatio = flipItem.item.coverArtAspectRatio ?? platformMedianAR.get(flipItem.item.platform) ?? 0.75;

              return (
                <GameCard
                  key={flipItem.key}
                  ref={flipItem.ref}
                  game={flipItem.item}
                  onPlay={onPlayGame}
                  onOptions={onGameOptions}
                  getMenuItems={getMenuItems}
                  artworkSyncStore={artworkSyncStore}
                  isLaunching={launchingGameId === flipItem.item.id}
                  disabled={launchingGameId != null && launchingGameId !== flipItem.item.id}
                  className={cn(
                    flipItem.animationState === 'entering' && 'animate-card-enter',
                    flipItem.animationState === 'exiting' && 'animate-card-exit',
                  )}
                  style={{
                    ...flipItem.style,
                    width: pos?.width ?? computeCardWidth(aspectRatio),
                    height: pos?.height ?? ROW_HEIGHT,
                  }}
                />
              );
            })}
          </div>
        )
      ) : (
        <div className="space-y-2">
          {/* List view implementation would go here */}
          <p className="text-muted-foreground">List view coming soon...</p>
        </div>
      )}

      {/* Scroll letter indicator (Steam-style) */}
      <ScrollLetterIndicator letter={letter} isVisible={isLetterVisible} />

      {/* Empty state */}
      {filteredGames.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-2">No games found</p>
          {searchQuery && (
            <Button variant="ghost" onClick={() => setSearchQuery('')}>
              Clear search
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
