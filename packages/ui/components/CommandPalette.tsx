import React, { useMemo, useCallback, useEffect, useState, useRef } from 'react'
import { Command, defaultFilter } from 'cmdk'
import { Search, Gamepad2, Monitor, Play } from 'lucide-react'
import { cn } from '../utils'
import type { Game } from './GameCard'

/** Maximum number of game results to render at once. */
const MAX_VISIBLE_GAMES = 10

/** An action the user can trigger from the command palette. */
export interface CommandAction {
  id: string
  label: string
  /** Optional category for grouping (e.g. "Actions", "Settings"). */
  group?: string
  icon?: React.ReactNode
  onSelect: () => void
  /** Search keywords beyond the label text. */
  keywords?: string[]
}

export interface CommandPaletteProps {
  /** Whether the palette is open. */
  open: boolean
  /** Called when the palette should close. */
  onOpenChange: (open: boolean) => void
  /** Games to search across. */
  games: Game[]
  /** Called when a game is selected from results. */
  onSelectGame: (game: Game) => void
  /** Quick actions available in the palette. */
  actions?: CommandAction[]
  className?: string
}

/** Unique platform names from a game list, sorted alphabetically. */
function extractPlatforms(games: Game[]): string[] {
  const set = new Set<string>()
  for (const game of games) {
    set.add(game.platform)
  }
  return Array.from(set).sort()
}

/** Platform game counts keyed by platform name. */
function countByPlatform(games: Game[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const game of games) {
    counts.set(game.platform, (counts.get(game.platform) ?? 0) + 1)
  }
  return counts
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onOpenChange,
  games,
  onSelectGame,
  actions = [],
  className,
}) => {
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const prevOpenRef = useRef(false)

  // Reset search when palette opens (not on every render)
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setSearch('')
    }
    prevOpenRef.current = open
  }, [open])

  const platforms = useMemo(() => extractPlatforms(games), [games])
  const platformCounts = useMemo(() => countByPlatform(games), [games])

  // External filtering: score + cap games to MAX_VISIBLE_GAMES
  const filteredGames = useMemo(() => {
    if (!search) {
      return games.slice(0, MAX_VISIBLE_GAMES)
    }
    const scored: Array<{ game: Game; score: number }> = []
    for (const game of games) {
      const score = defaultFilter(`${game.title} ${game.platform}`, search)
      if (score > 0) {
        scored.push({ game, score })
      }
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, MAX_VISIBLE_GAMES).map((s) => s.game)
  }, [games, search])

  const remainingGames = search ? 0 : Math.max(0, games.length - MAX_VISIBLE_GAMES)

  // External filtering: platforms (small set, no cap needed)
  const filteredPlatforms = useMemo(() => {
    if (!search) return platforms
    return platforms.filter((p) => defaultFilter(p, search) > 0)
  }, [platforms, search])

  // External filtering: actions (small set, no cap needed)
  const filteredGroupedActions = useMemo(() => {
    const groups = new Map<string, CommandAction[]>()
    for (const action of actions) {
      if (search) {
        const text = action.keywords
          ? `${action.label} ${action.keywords.join(' ')}`
          : action.label
        if (defaultFilter(text, search) <= 0) continue
      }
      const group = action.group ?? 'Actions'
      const list = groups.get(group)
      if (list) {
        list.push(action)
      } else {
        groups.set(group, [action])
      }
    }
    return groups
  }, [actions, search])

  const hasResults =
    filteredGames.length > 0 ||
    filteredPlatforms.length > 0 ||
    Array.from(filteredGroupedActions.values()).some((g) => g.length > 0)

  const handleSelectGame = useCallback(
    (gameId: string) => {
      const game = games.find((g) => g.id === gameId)
      if (game) {
        onSelectGame(game)
        onOpenChange(false)
      }
    },
    [games, onSelectGame, onOpenChange],
  )

  const handleSelectAction = useCallback(
    (action: CommandAction) => {
      action.onSelect()
      onOpenChange(false)
    },
    [onOpenChange],
  )

  // Keep the palette mounted (hidden) to avoid re-mount cost on every open.
  // Visibility is controlled via CSS, not by unmounting.
  if (!open) {
    return <div className="hidden" aria-hidden />
  }

  return (
    <div className="fixed inset-0 z-50" data-state="open">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 animate-overlay-fade-in"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />

      {/* Command palette container */}
      <div className="fixed inset-0 flex items-start justify-center pt-[20vh]">
        <Command
          className={cn(
            'w-full max-w-lg rounded-lg border bg-popover text-popover-foreground shadow-2xl animate-dialog-scan-in',
            className,
          )}
          shouldFilter={false}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onOpenChange(false)
            }
          }}
          loop
        >
          {/* Search input */}
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <Command.Input
              ref={inputRef}
              value={search}
              onValueChange={setSearch}
              placeholder="Search games, platforms, or actions..."
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
            <kbd className="ml-2 hidden shrink-0 select-none rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <Command.List className="max-h-[300px] overflow-y-auto overscroll-contain p-1">
            {!hasResults && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No results found.
              </div>
            )}

            {/* Games */}
            {filteredGames.length > 0 && (
              <Command.Group heading="Games" className="command-palette-group">
                {filteredGames.map((game) => (
                  <Command.Item
                    key={game.id}
                    value={game.id}
                    onSelect={() => handleSelectGame(game.id)}
                    className="command-palette-item"
                  >
                    {game.coverArt ? (
                      <img
                        src={game.coverArt}
                        alt=""
                        className="h-8 w-6 rounded-sm object-cover mr-3 shrink-0"
                      />
                    ) : (
                      <Gamepad2 className="h-4 w-4 mr-3 shrink-0 text-muted-foreground" />
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="truncate text-sm">{game.title}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {game.platform}
                      </span>
                    </div>
                  </Command.Item>
                ))}
                {remainingGames > 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground/60">
                    Type to search {remainingGames} more game{remainingGames === 1 ? '' : 's'}…
                  </div>
                )}
              </Command.Group>
            )}

            {/* Platforms */}
            {filteredPlatforms.length > 0 && (
              <Command.Group heading="Platforms" className="command-palette-group">
                {filteredPlatforms.map((platform) => {
                  const count = platformCounts.get(platform) ?? 0
                  return (
                    <Command.Item
                      key={platform}
                      value={`platform-${platform}`}
                      onSelect={() => {
                        const first = games.find((g) => g.platform === platform)
                        if (first) onSelectGame(first)
                        onOpenChange(false)
                      }}
                      className="command-palette-item"
                    >
                      <Monitor className="h-4 w-4 mr-3 shrink-0 text-muted-foreground" />
                      <span className="text-sm">{platform}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {count} {count === 1 ? 'game' : 'games'}
                      </span>
                    </Command.Item>
                  )
                })}
              </Command.Group>
            )}

            {/* Actions (grouped) */}
            {Array.from(filteredGroupedActions.entries()).map(([group, groupActions]) => (
              <Command.Group key={group} heading={group} className="command-palette-group">
                {groupActions.map((action) => (
                  <Command.Item
                    key={action.id}
                    value={action.id}
                    onSelect={() => handleSelectAction(action)}
                    className="command-palette-item"
                  >
                    {action.icon ?? (
                      <Play className="h-4 w-4 mr-3 shrink-0 text-muted-foreground" />
                    )}
                    <span className="text-sm">{action.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
