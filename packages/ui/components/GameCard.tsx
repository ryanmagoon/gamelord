import React, { useRef, useCallback, useEffect } from 'react'
import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { cn } from '../utils'
import { MoreVertical } from 'lucide-react'
import { TVStatic, type ArtworkSyncPhase } from './TVStatic'
import { useAspectRatioTransition } from '../hooks/useAspectRatioTransition'

/** Duration of the cross-fade (static out, image in) in ms. */
const CROSS_FADE_DURATION = 500

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
}

export interface GameCardMenuItem {
  label: string
  icon?: React.ReactNode
  onClick: () => void
}

export interface GameCardProps {
  game: Game
  onPlay: (game: Game) => void
  /** @deprecated Use menuItems instead for dropdown menu support. */
  onOptions?: (game: Game) => void
  /** Menu items shown in the options dropdown on hover. */
  menuItems?: GameCardMenuItem[]
  /**
   * Current artwork sync phase for this card.
   * Active phases show TV static, 'done' triggers a dissolve-in transition,
   * null/undefined shows the normal placeholder or cover art.
   */
  artworkSyncPhase?: ArtworkSyncPhase
  className?: string
  /** Inline styles forwarded to the root card element (useful for animation delays). */
  style?: React.CSSProperties
  /** Ref forwarded to the root Card element (used for FLIP measurements). */
  ref?: React.Ref<HTMLDivElement>
}

/** Map sync phases to user-facing status labels. */
const PHASE_STATUS_TEXT: Partial<Record<NonNullable<ArtworkSyncPhase>, string>> = {
  hashing: 'Reading...',
  querying: 'Searching...',
  downloading: 'Downloading...',
}

export const GameCard: React.FC<GameCardProps> = ({
  game,
  onPlay,
  onOptions,
  menuItems,
  artworkSyncPhase,
  className,
  style,
  ref,
}) => {
  const handlePlay = (e: React.MouseEvent) => {
    e.preventDefault()
    onPlay(game)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onPlay(game)
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

  // 'done' phase: cover art just arrived — resize then cross-fade
  const isDone = artworkSyncPhase === 'done'

  // Use the actual cover art aspect ratio when available, otherwise default to 3:4
  const aspectRatio = game.coverArtAspectRatio ?? 0.75

  // Refs for imperative cross-fade (no React re-renders during animation)
  const imgRef = useRef<HTMLImageElement>(null)
  const staticWrapperRef = useRef<HTMLDivElement>(null)
  /** Whether the image has been decoded and is ready to display without jank. */
  const imageReadyRef = useRef(false)
  /** Whether the resize has finished (waiting for image to be ready). */
  const resizeDoneRef = useRef(false)

  /** Imperatively start the cross-fade — only once both resize and image decode are done. */
  const tryCrossFade = useCallback(() => {
    if (!imageReadyRef.current || !resizeDoneRef.current) return

    const img = imgRef.current
    const staticWrapper = staticWrapperRef.current

    if (img) {
      img.classList.remove('opacity-0')
      img.classList.add('animate-artwork-dissolve-in')
    }

    if (staticWrapper) {
      staticWrapper.style.opacity = '0'
      staticWrapper.style.transition = `opacity ${CROSS_FADE_DURATION}ms cubic-bezier(0.16, 1, 0.3, 1)`
    }
  }, [])

  /** Pin the static wrapper at its current height so the canvas doesn't resize during the card height transition. */
  const handleResizeStart = useCallback((currentHeight: number) => {
    const staticWrapper = staticWrapperRef.current
    if (staticWrapper) {
      staticWrapper.style.height = `${currentHeight}px`
      staticWrapper.style.bottom = 'auto'
    }
  }, [])

  const handleResizeComplete = useCallback(() => {
    resizeDoneRef.current = true
    tryCrossFade()
  }, [tryCrossFade])

  // Pre-decode the image when coverArt arrives so the browser doesn't stall
  // the main thread during the cross-fade animation.
  useEffect(() => {
    if (!game.coverArt || !isDone) return

    imageReadyRef.current = false
    resizeDoneRef.current = false

    const img = imgRef.current
    if (!img) return

    // decode() returns a promise that resolves after the browser has decoded
    // the image data — subsequent paints won't stall.
    img.decode?.()
      .then(() => {
        imageReadyRef.current = true
        tryCrossFade()
      })
      .catch(() => {
        // Decode failed (e.g. broken image) — proceed anyway
        imageReadyRef.current = true
        tryCrossFade()
      })
  }, [game.coverArt, isDone, tryCrossFade])

  const { containerRef } = useAspectRatioTransition({
    aspectRatio,
    enabled: isDone,
    onResizeStart: handleResizeStart,
    onResizeComplete: handleResizeComplete,
  })

  // Show the static overlay during active sync phases, done phase, OR as
  // an idle placeholder when there's no cover art at all.
  const isFallback = !game.coverArt && !isActivelySyncing && !isTerminalPhase && !isDone
  const showStatic = isActivelySyncing || isTerminalPhase || isDone || isFallback

  return (
    <Card
      ref={ref}
      className={cn(
        'group relative overflow-hidden rounded-none border-0 transition-all hover:scale-105 hover:shadow-lg w-full cursor-pointer',
        className
      )}
      style={style}
      onClick={handlePlay}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Play ${game.title}`}
      title={game.title}
    >
      <CardContent className="p-0">
        <div ref={containerRef} className="relative bg-muted overflow-hidden">
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
              'w-full h-full object-cover',
              // Visible only if coverArt exists and we're NOT in a done-transition
              game.coverArt && !isDone ? 'opacity-100' : 'opacity-0',
            )}
          />

          {/*
           * TV static overlay — always in the DOM, controlled via the wrapper's
           * opacity. Never changes its aspect ratio during transition to avoid
           * canvas rebuild. The wrapper ref lets us fade it out imperatively.
           */}
          <div ref={staticWrapperRef} className="absolute inset-0">
            <TVStatic
              active={showStatic}
              phase={artworkSyncPhase}
              statusText={artworkSyncPhase ? PHASE_STATUS_TEXT[artworkSyncPhase] : undefined}
              aspectRatio={0.75}
            />
          </div>

          {/* Fallback: game title over static when no cover art */}
          {isFallback && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 pb-2 pt-6 pointer-events-none">
              <span className="text-sm font-semibold text-white leading-tight line-clamp-2">
                {game.title}
              </span>
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
}
