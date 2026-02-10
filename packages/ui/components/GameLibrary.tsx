import React, { useState, useMemo, useRef, useCallback } from 'react';
import { GameCard, Game, GameCardMenuItem } from './GameCard';
import type { ArtworkSyncPhase } from './TVStatic';
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

export interface GameLibraryProps {
  games: Game[];
  onPlayGame: (game: Game) => void;
  onGameOptions?: (game: Game) => void;
  /** Returns menu items for a specific game's dropdown. */
  getMenuItems?: (game: Game) => GameCardMenuItem[];
  /** Per-game artwork sync phases. Key is game ID, value is current phase. */
  artworkSyncPhases?: Map<string, ArtworkSyncPhase>;
  className?: string;
}

type ViewMode = 'grid' | 'list';
type SortBy = 'title' | 'platform' | 'lastPlayed' | 'recent';

export const GameLibrary: React.FC<GameLibraryProps> = ({
  games,
  onPlayGame,
  onGameOptions,
  getMenuItems,
  artworkSyncPhases,
  className
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortBy>('title');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const gridRef = useRef<HTMLDivElement>(null);
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

  const flipItems = useFlipAnimation(filteredGames, getGameKey, { gridRef });

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
        <div
          ref={gridRef}
          className="relative grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-1 items-start"
        >
          {flipItems.map((flipItem) => (
            <GameCard
              key={flipItem.key}
              ref={flipItem.ref}
              game={flipItem.item}
              onPlay={onPlayGame}
              onOptions={onGameOptions}
              getMenuItems={getMenuItems}
              artworkSyncPhase={artworkSyncPhases?.get(flipItem.item.id)}
              className={cn(
                (flipItem.item.coverArtAspectRatio ?? 0.75) > 1 ? 'col-span-3' : 'col-span-2',
                flipItem.animationState === 'entering' && 'animate-card-enter',
                flipItem.animationState === 'exiting' && 'animate-card-exit',
              )}
              style={flipItem.style}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {/* List view implementation would go here */}
          <p className="text-muted-foreground">List view coming soon...</p>
        </div>
      )}

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