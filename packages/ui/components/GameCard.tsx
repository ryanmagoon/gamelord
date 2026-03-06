import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react'
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
import { useEdgeAwareHover } from '../hooks/useEdgeAwareHover'

export interface Game {
  coverArt?: string
  /** Width/height ratio of cover art (e.g. 0.714). Used for dynamic card sizing. */
  coverArtAspectRatio?: number
  favorite?: boolean
  genre?: string
  id: string
  lastPlayed?: Date
  platform: string
  playTime?: number
  romPath: string
  /** Machine-readable system identifier (e.g. "snes", "nes"). Used for launch. */
  systemId?: string
  title: string
}

export interface GameCardMenuItem {
  icon?: React.ReactNode
  label: string
  onClick: () => void
}

export interface GameCardProps {
  /** External store for artwork sync phases. The card subscribes to its own game's phase. */
  artworkSyncStore?: ArtworkSyncStore
  className?: string
  /** Whether this card is disabled (e.g. another game is launching). Dims the card and prevents interaction. */
  disabled?: boolean
  game: Game
  /** Factory function that returns menu items. Called lazily when dropdown opens. Preferred over menuItems for memoization. */
  getMenuItems?: (game: Game) => Array<GameCardMenuItem>
  /** Whether this game is currently being launched. Shows a shimmer overlay and wait cursor. */
  isLaunching?: boolean
  /** Menu items shown in the options dropdown on hover. */
  menuItems?: Array<GameCardMenuItem>
  /** @deprecated Use menuItems instead for dropdown menu support. */
  onOptions?: (game: Game) => void
  onPlay: (game: Game, cardRect?: DOMRect) => void
  /** Called when the user toggles the favorite heart on this card. */
  onToggleFavorite?: (game: Game) => void
  /** Ref forwarded to the root Card element (used for FLIP measurements). */
  ref?: React.Ref<HTMLDivElement>
  /** Inline styles forwarded to the root card element (useful for animation delays). */
  style?: React.CSSProperties
}

export const GameCard: React.FC<GameCardProps> = React.memo(function GameCard({
  artworkSyncStore,
  className,
  disabled,
  game,
  getMenuItems,
  isLaunching,
  menuItems: menuItemsProp,
  onOptions,
  onPlay,
  onToggleFavorite,
  ref,
  style,
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

  // Edge-aware hover: shift card inward when scaled-up version would clip.
  // Lock the translate during launch so the card holds position when the modal opens.
  const { edgeTranslate, onPointerEnter, onPointerLeave } = useEdgeAwareHover({
    disabled,
    locked: isLaunching,
    scaleFactor: 1.15,
  })

  // Merge edge-aware translate into existing style prop
  const mergedStyle = useMemo(() => {
    if (!edgeTranslate) {return style}
    return {
      ...style,
      translate: `${edgeTranslate.x}px ${edgeTranslate.y}px`,
    }
  }, [style, edgeTranslate])

  // Merge forwarded ref and internal cardRef
  const mergedCardRef = useCallback((el: HTMLDivElement | null) => {
    cardRef.current = el
    if (typeof ref === 'function') {ref(el)}
    else if (ref) {(ref as React.MutableRefObject<HTMLDivElement | null>).current = el}
  }, [ref])

  return (
    <Card
      aria-label={`Play ${game.title}`}
      className={cn(
        'game-card-border group relative rounded-none border-0 w-full h-full',
        disabled
          ? 'pointer-events-none opacity-50'
          : 'hover:scale-[1.15] hover:z-10 cursor-pointer',
        isLaunching && 'game-card-active cursor-wait z-10 scale-[1.15]',
        className
      )}
      onClick={handlePlay}
      onKeyDown={handleKeyDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      ref={mergedCardRef}
      role="button"
      style={mergedStyle}
      tabIndex={0}
      title={game.title}
    >
      <CardContent className="p-0 game-card-inner">
        <div className="relative bg-muted overflow-hidden h-full">
          {/*
           * Cover art image — ALWAYS in the DOM so React never has to mount/
           * unmount it during animation. Hidden via opacity-0 until the
           * cross-fade starts imperatively.
           */}
          <img
            alt={game.title}
            className={cn(
              'w-full h-full object-cover transition-opacity duration-500 ease-out',
              // During done phase: hidden until crossFadeReady, then fade in.
              // Steady state: visible when coverArt exists.
              game.coverArt && (isDone ? crossFadeReady : true) ? 'opacity-100' : 'opacity-0',
            )}
            ref={imgRef}
            src={game.coverArt ?? undefined}
          />

          {/*
           * TV static overlay — always in the DOM, controlled via the wrapper's
           * opacity. Never changes its aspect ratio during transition to avoid
           * canvas rebuild. The wrapper ref lets us fade it out imperatively.
           */}
          <div
            className={cn(
              'absolute inset-0 transition-opacity duration-500 ease-out',
              // Keep pulsing during done phase until the image covers it
              (isActivelySyncing || (isDone && !crossFadeReady)) && 'animate-card-sync-pulse',
              crossFadeReady && 'opacity-0',
            )}
            ref={staticWrapperRef}
          >
            <TVStatic
              active={showStatic}
              aspectRatio={0.75}
              // During done phase, keep the static looking like it's still
              // downloading so it doesn't freeze — the image fades over it.
              phase={isDone ? 'downloading' : artworkSyncPhase}
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
                aria-label={game.favorite ? `Unfavorite ${game.title}` : `Favorite ${game.title}`}
                className="h-8 w-8 bg-black/50 hover:bg-black/70 text-white"
                onAnimationEnd={() => setFavoritePop(false)}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setFavoritePop(true)
                  onToggleFavorite(game)
                }}
                size="icon"
                variant="ghost"
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
                      aria-label={`Options for ${game.title}`}
                      className="h-8 w-8 bg-black/50 hover:bg-black/70 text-white"
                      onClick={(e) => e.stopPropagation()}
                      size="icon"
                      variant="ghost"
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
                  aria-label={`Options for ${game.title}`}
                  className="h-8 w-8 bg-black/50 hover:bg-black/70 text-white"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onOptions?.(game)
                  }}
                  size="icon"
                  variant="ghost"
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
