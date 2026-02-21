import React, { useRef, useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { cn } from '../utils'
import { MoreVertical, Heart } from 'lucide-react'
import { TVStatic } from './TVStatic'
import { useArtworkSyncPhase, type ArtworkSyncStore } from '../hooks/useArtworkSyncStore'

export interface Game {
  id: string
  title: string
  platform: string
  /** Machine-readable system identifier (e.g. "snes", "nes"). Used for launch. */
  systemId?: string
  genre?: string
  coverArt?: string
  /** Width/height ratio of cover art (e.g. 0.714). Used for dynamic card sizing. */
  coverArtAspectRatio?: number
  romPath: string
  lastPlayed?: Date
  playTime?: number
  favorite?: boolean
}

export interface GameCardMenuItem {
  label: string
  icon?: React.ReactNode
  onClick: () => void
}

export interface GameCardProps {
  game: Game
  onPlay: (game: Game, cardRect?: DOMRect) => void
  /** @deprecated Use menuItems instead for dropdown menu support. */
  onOptions?: (game: Game) => void
  /** Menu items shown in the options dropdown on hover. */
  menuItems?: GameCardMenuItem[]
  /** Factory function that returns menu items. Called lazily when dropdown opens. Preferred over menuItems for memoization. */
  getMenuItems?: (game: Game) => GameCardMenuItem[]
  /** Called when the user toggles the favorite heart on this card. */
  onToggleFavorite?: (game: Game) => void
  /** External store for artwork sync phases. The card subscribes to its own game's phase. */
  artworkSyncStore?: ArtworkSyncStore
  /** Whether this game is currently being launched. Shows a shimmer overlay and wait cursor. */
  isLaunching?: boolean
  /** Whether this card is disabled (e.g. another game is launching). Dims the card and prevents interaction. */
  disabled?: boolean
  className?: string
  /** Inline styles forwarded to the root card element (useful for animation delays). */
  style?: React.CSSProperties
  /** Ref forwarded to the root Card element (used for FLIP measurements). */
  ref?: React.Ref<HTMLDivElement>
}

export const GameCard: React.FC<GameCardProps> = React.memo(function GameCard({
  game,
  onPlay,
  onOptions,
  onToggleFavorite,
  menuItems: menuItemsProp,
  getMenuItems,
  artworkSyncStore,
  isLaunching,
  disabled,
  className,
  style,
  ref,
}) {
  // Subscribe to this game's sync phase — only re-renders when THIS game's phase changes
  const artworkSyncPhase = useArtworkSyncPhase(artworkSyncStore, game.id)
  // Resolve menu items: prefer lazy factory over static array
  const menuItems = menuItemsProp ?? (getMenuItems ? getMenuItems(game) : undefined)
  const handlePlay = (e: React.MouseEvent) => {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    onPlay(game, rect)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const rect = e.currentTarget.getBoundingClientRect()
      onPlay(game, rect)
    }
  }

  const hasMenu = (menuItems && menuItems.length > 0) || onOptions

  // Active sync phases that should show TV static
  const isActivelySyncing =
    artworkSyncPhase === 'hashing' ||
    artworkSyncPhase === 'querying' ||
    artworkSyncPhase === 'downloading'

  // Brief flash states for error/not-found
  const isTerminalPhase =
    artworkSyncPhase === 'error' || artworkSyncPhase === 'not-found'

  // 'done' phase: cover art just arrived — cross-fade image over static
  const isDone = artworkSyncPhase === 'done'

  const imgRef = useRef<HTMLImageElement>(null)
  const staticWrapperRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)

  // Brief scale-bounce when the heart is toggled.
  const [favoritePop, setFavoritePop] = useState(false)

  // Cross-fade: pre-decode the image then reveal it over the static.
  const [crossFadeReady, setCrossFadeReady] = useState(false)

  useEffect(() => {
    if (!isDone || !game.coverArt) {
      setCrossFadeReady(false)
      return
    }
    const img = imgRef.current
    const noop = () => { /* intentional */ }
    const decodePromise = img?.decode?.().catch(noop) ?? Promise.resolve()
    decodePromise.then(() => setCrossFadeReady(true))
  }, [isDone, game.coverArt])

  // During the done phase, keep the static and title running normally
  // underneath while the cover art fades in on top. Only treat the
  // underlying layers as "inactive" after the cross-fade completes.
  const isFallback = !game.coverArt && !isActivelySyncing && !isTerminalPhase && !isDone
  const showStatic = isActivelySyncing || isTerminalPhase || isDone || isFallback

  // Merge forwarded ref and internal cardRef
  const mergedCardRef = useCallback((el: HTMLDivElement | null) => {
    cardRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el
  }, [ref])

  return (
    <Card
      ref={mergedCardRef}
      className={cn(
        'group relative overflow-hidden rounded-none border-0 w-full h-full',
        disabled
          ? 'pointer-events-none opacity-50'
          : 'hover:scale-105 hover:shadow-lg hover:z-10 cursor-pointer',
        isLaunching && 'cursor-wait z-10 scale-105 shadow-lg',
        className
      )}
      style={{
        ...style,
        transition: 'transform 200ms, box-shadow 200ms, height 400ms cubic-bezier(0.25, 1, 0.5, 1)',
      }}
      onClick={handlePlay}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Play ${game.title}`}
      title={game.title}
    >
      <CardContent className="p-0 h-full">
        <div className="relative bg-muted overflow-hidden h-full">
          {/*
           * Cover art image — ALWAYS in the DOM so React never has to mount/
           * unmount it during animation. Hidden via opacity-0 until the
           * cross-fade starts imperatively.
           */}
          <img
            ref={imgRef}
            src={game.coverArt ?? undefined}
            alt={game.title}
            className={cn(
              'w-full h-full object-cover transition-opacity duration-500 ease-out',
              // During done phase: hidden until crossFadeReady, then fade in.
              // Steady state: visible when coverArt exists.
              game.coverArt && (isDone ? crossFadeReady : true) ? 'opacity-100' : 'opacity-0',
            )}
          />

          {/*
           * TV static overlay — always in the DOM, controlled via the wrapper's
           * opacity. Never changes its aspect ratio during transition to avoid
           * canvas rebuild. The wrapper ref lets us fade it out imperatively.
           */}
          <div
            ref={staticWrapperRef}
            className={cn(
              'absolute inset-0 transition-opacity duration-500 ease-out',
              // Keep pulsing during done phase until the image covers it
              (isActivelySyncing || (isDone && !crossFadeReady)) && 'animate-card-sync-pulse',
              crossFadeReady && 'opacity-0',
            )}
          >
            <TVStatic
              active={showStatic}
              // During done phase, keep the static looking like it's still
              // downloading so it doesn't freeze — the image fades over it.
              phase={isDone ? 'downloading' : artworkSyncPhase}
              aspectRatio={0.75}
            />
          </div>

          {/* "Artwork not found" label — persists so the user knows not to retry */}
          {artworkSyncPhase === 'not-found' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-xs font-mono font-bold text-amber-300/90 uppercase tracking-wider select-none animate-not-found-fade-in drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                Artwork not found
              </span>
            </div>
          )}

          {/* Game title over static — visible during fallback, sync, not-found,
              and done (until cross-fade covers it). Fades out with the static wrapper. */}
          {(isFallback || isActivelySyncing || artworkSyncPhase === 'not-found' || (isDone && !crossFadeReady)) && (
            <div className={cn(
              'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-3 pt-8 pointer-events-none transition-opacity duration-500 ease-out',
              crossFadeReady && 'opacity-0',
            )}>
              <span className="text-lg font-bold text-white leading-tight line-clamp-2">
                {game.title}
              </span>
            </div>
          )}

          {/* Launch shimmer overlay */}
          {isLaunching && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute inset-0 animate-card-launch-shimmer bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            </div>
          )}

          {/* Favorite heart toggle */}
          {onToggleFavorite && (
            <div className={cn(
              'absolute top-2 left-2 transition-opacity',
              game.favorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
            )}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 bg-black/50 hover:bg-black/70 text-white"
                aria-label={game.favorite ? `Unfavorite ${game.title}` : `Favorite ${game.title}`}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setFavoritePop(true)
                  onToggleFavorite(game)
                }}
                onAnimationEnd={() => setFavoritePop(false)}
              >
                <Heart
                  className={cn(
                    'h-4 w-4 transition-transform',
                    game.favorite && 'fill-current text-red-500',
                    favoritePop && 'animate-favorite-pop',
                  )}
                />
              </Button>
            </div>
          )}

          {/* Options dropdown menu */}
          {hasMenu && (
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              {menuItems && menuItems.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 bg-black/50 hover:bg-black/70 text-white"
                      aria-label={`Options for ${game.title}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {menuItems.map((item) => (
                      <DropdownMenuItem
                        key={item.label}
                        onClick={item.onClick}
                      >
                        {item.icon}
                        {item.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 bg-black/50 hover:bg-black/70 text-white"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onOptions?.(game)
                  }}
                  aria-label={`Options for ${game.title}`}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}, (prev, next) => {
  // Custom comparator: skip menuItems/getMenuItems reference checks
  // (menuItems are generated lazily, getMenuItems is a stable factory).
  // artworkSyncStore is a stable singleton — never changes.
  // artworkSyncPhase is managed internally via useSyncExternalStore.
  return (
    prev.game === next.game &&
    prev.onPlay === next.onPlay &&
    prev.onOptions === next.onOptions &&
    prev.onToggleFavorite === next.onToggleFavorite &&
    prev.artworkSyncStore === next.artworkSyncStore &&
    prev.isLaunching === next.isLaunching &&
    prev.disabled === next.disabled &&
    prev.className === next.className &&
    prev.style === next.style &&
    prev.ref === next.ref
  )
}) as React.FC<GameCardProps>
