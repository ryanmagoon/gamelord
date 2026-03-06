import React, { useMemo, useCallback, useEffect, useState, useRef } from 'react'
import { Command } from 'cmdk'
import { Search, Gamepad2, Monitor, Play } from 'lucide-react'
import { cn } from '../utils'
import type { Game } from './GameCard'

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

  // Reset search when palette opens
  useEffect(() => {
    if (open) {
      setSearch('')
    }
  }, [open])

  const platforms = useMemo(() => extractPlatforms(games), [games])

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

  // Group actions by their group property
  const groupedActions = useMemo(() => {
    const groups = new Map<string, CommandAction[]>()
    for (const action of actions) {
      const group = action.group ?? 'Actions'
      const list = groups.get(group)
      if (list) {
        list.push(action)
      } else {
        groups.set(group, [action])
      }
    }
    return groups
  }, [actions])

  // Delayed unmount so close animation plays
  const [mounted, setMounted] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (open) {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      setMounted(true)
    } else if (mounted) {
      timerRef.current = setTimeout(() => {
        setMounted(false)
        timerRef.current = null
      }, 220) // matches dialog-scan-out duration
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [open, mounted])

  if (!open && !mounted) return null

  return (
    <div className="fixed inset-0 z-50" data-state={open ? 'open' : 'closed'}>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 bg-black/50',
          open ? 'animate-overlay-fade-in' : 'animate-overlay-fade-out',
        )}
        onClick={() => onOpenChange(false)}
        aria-hidden
      />

      {/* Command palette container */}
      <div className="fixed inset-0 flex items-start justify-center pt-[20vh]">
        <Command
          className={cn(
            'w-full max-w-lg rounded-lg border bg-popover text-popover-foreground shadow-2xl',
            open ? 'animate-dialog-scan-in' : 'animate-dialog-scan-out',
            className,
          )}
          shouldFilter
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
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>

            {/* Games */}
            <Command.Group heading="Games" className="command-palette-group">
              {games.map((game) => (
                <Command.Item
                  key={game.id}
                  value={`${game.title} ${game.platform}`}
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
            </Command.Group>

            {/* Platforms */}
            {platforms.length > 0 && (
              <Command.Group heading="Platforms" className="command-palette-group">
                {platforms.map((platform) => {
                  const count = games.filter((g) => g.platform === platform).length
                  return (
                    <Command.Item
                      key={platform}
                      value={`platform: ${platform}`}
                      keywords={[platform]}
                      onSelect={() => {
                        // Select the first game of this platform as a navigation shortcut
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
            {Array.from(groupedActions.entries()).map(([group, groupActions]) => (
              <Command.Group key={group} heading={group} className="command-palette-group">
                {groupActions.map((action) => (
                  <Command.Item
                    key={action.id}
                    value={action.label}
                    keywords={action.keywords}
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
