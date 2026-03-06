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
import { Search, Filter, Grid, List, Heart } from 'lucide-react';
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
    if (!grid) {return;}

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
  scrollContainerRef
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortBy>('title');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
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

    // Favorites filter
    if (showFavoritesOnly) {
      filtered = filtered.filter(game => game.favorite);
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
          if (!a.lastPlayed) {return 1;}
          if (!b.lastPlayed) {return -1;}
          return b.lastPlayed.getTime() - a.lastPlayed.getTime();
        });
        break;
      case 'recent':
        filtered = [...filtered].reverse();
        break;
    }

    return filtered;
  }, [games, searchQuery, selectedPlatform, sortBy, showFavoritesOnly]);

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

  const { totalHeight, visibleIndices } = useMosaicVirtualizer({
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
    const filterKey = `${searchQuery}|${selectedPlatform}|${sortBy}|${showFavoritesOnly}`;
    if (filterKey !== prevFilterKeyRef.current) {
      const isInitial = prevFilterKeyRef.current === '';
      prevFilterKeyRef.current = filterKey;
      if (!isInitial && isLargeList) {
        scrollContainerRef?.current?.scrollTo({ top: 0 });
        setEnterGeneration(g => g + 1);
      }
    }
  }, [searchQuery, selectedPlatform, sortBy, showFavoritesOnly, isLargeList, scrollContainerRef]);

  // Clear entrance animation flag after stagger completes
  const [showEntrance, setShowEntrance] = useState(false);
  useEffect(() => {
    if (enterGeneration === 0) {return;}
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
    <div className={cn("space-y-6", className)}>
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-10"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search games..."
            value={searchQuery}
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <Select onValueChange={setSelectedPlatform} value={selectedPlatform}>
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
            aria-label={showFavoritesOnly ? 'Show all games' : 'Show favorites only'}
            onClick={() => setShowFavoritesOnly(prev => !prev)}
            size="icon"
            title={showFavoritesOnly ? 'Show all games' : 'Show favorites only'}
            variant={showFavoritesOnly ? 'default' : 'ghost'}
          >
            <Heart className={cn('h-4 w-4', showFavoritesOnly && 'fill-current')} />
          </Button>

          {/* View mode toggle */}
          <div className="flex border rounded-md">
            <Button
              className="rounded-r-none"
              onClick={() => setViewMode('grid')}
              size="icon"
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              className="rounded-l-none"
              onClick={() => setViewMode('list')}
              size="icon"
              variant={viewMode === 'list' ? 'default' : 'ghost'}
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
        <div className="flex items-center gap-2">
          {selectedPlatform !== 'all' && (
            <Badge className="cursor-pointer" onClick={() => setSelectedPlatform('all')} variant="secondary">
              {selectedPlatform} ✕
            </Badge>
          )}
          {showFavoritesOnly && (
            <Badge className="cursor-pointer" onClick={() => setShowFavoritesOnly(false)} variant="secondary">
              Favorites ✕
            </Badge>
          )}
        </div>
      </div>

      {/* Games Grid/List */}
      {viewMode === 'grid' ? (
        isLargeList ? (
          /* ---- Virtualized path (>100 items) ---- */
          <div
            className="relative"
            ref={gridRef}
            style={{ height: totalHeight > 0 ? totalHeight : undefined }}
          >
            {visibleIndices.map((index, visibleIndex) => {
              const game = filteredGames[index];
              const pos = layout.items[index];
              if (!pos) {return null;}
              const isEntering = showEntrance && visibleIndex < 30;

              return (
                <GameCard
                  artworkSyncStore={artworkSyncStore}
                  className={cn(isEntering && 'animate-card-enter')}
                  disabled={launchingGameId != null && launchingGameId !== game.id}
                  game={game}
                  getMenuItems={getMenuItems}
                  isLaunching={launchingGameId === game.id}
                  key={game.id}
                  onOptions={onGameOptions}
                  onPlay={onPlayGame}
                  onToggleFavorite={onToggleFavorite}
                  style={{
                    height: pos.height,
                    left: pos.x,
                    position: 'absolute',
                    top: pos.y,
                    width: pos.width,
                    ...(isEntering ? { animationDelay: `${Math.min(visibleIndex * 30, 400)}ms` } : undefined),
                  }}
                />
              );
            })}
          </div>
        ) : (
          /* ---- Small-list path (<=100 items, with FLIP animations) ---- */
          <div
            className="relative flex flex-wrap"
            ref={gridRef}
            style={{ gap: `${MOSAIC_GAP}px` }}
          >
            {flipItems.map((flipItem) => {
              const layoutIndex = filteredGames.indexOf(flipItem.item);
              const pos = layoutIndex >= 0 ? layout.items[layoutIndex] : undefined;
              const aspectRatio = flipItem.item.coverArtAspectRatio ?? platformMedianAR.get(flipItem.item.platform) ?? 0.75;

              return (
                <GameCard
                  artworkSyncStore={artworkSyncStore}
                  className={cn(
                    flipItem.animationState === 'entering' && 'animate-card-enter',
                    flipItem.animationState === 'exiting' && 'animate-card-exit',
                  )}
                  disabled={launchingGameId != null && launchingGameId !== flipItem.item.id}
                  game={flipItem.item}
                  getMenuItems={getMenuItems}
                  isLaunching={launchingGameId === flipItem.item.id}
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
        <div className="space-y-2">
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
            <Button onClick={() => setSearchQuery('')} variant="ghost">
              Clear search
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
