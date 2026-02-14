import { describe, it, expect, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GameCard, Game } from './GameCard'
import { ArtworkSyncStore } from '../hooks/useArtworkSyncStore'
import type { ArtworkSyncPhase } from './TVStatic'

const mockGame: Game = {
  id: '1',
  title: 'Super Mario Bros.',
  platform: 'NES',
  genre: 'Platform',
  romPath: '/roms/smb.nes',
}

/** Creates a store with a preset phase for the mock game. */
function storeWithPhase(phase: ArtworkSyncPhase): ArtworkSyncStore {
  const store = new ArtworkSyncStore()
  if (phase !== null) store.setPhase(mockGame.id, phase)
  return store
}

describe('GameCard', () => {
  describe('accessibility', () => {
    it('card has role="button" and aria-label with game title', () => {
      const onPlay = vi.fn()
      render(<GameCard game={mockGame} onPlay={onPlay} />)

      const card = screen.getByRole('button', { name: /play super mario bros/i })
      expect(card).toBeInTheDocument()
    })

    it('card has title attribute for tooltip', () => {
      const onPlay = vi.fn()
      render(<GameCard game={mockGame} onPlay={onPlay} />)

      const card = screen.getByRole('button', { name: /play super mario bros/i })
      expect(card).toHaveAttribute('title', 'Super Mario Bros.')
    })

    it('renders Options button with aria-label containing game title when onOptions is provided', () => {
      const onPlay = vi.fn()
      const onOptions = vi.fn()
      render(<GameCard game={mockGame} onPlay={onPlay} onOptions={onOptions} />)

      const optionsButton = screen.getByRole('button', { name: /options for super mario bros/i })
      expect(optionsButton).toBeInTheDocument()
    })

    it('does not render Options button when onOptions is not provided', () => {
      const onPlay = vi.fn()
      render(<GameCard game={mockGame} onPlay={onPlay} />)

      const optionsButton = screen.queryByRole('button', { name: /options for/i })
      expect(optionsButton).not.toBeInTheDocument()
    })

    it('Options button container uses focus-within to reveal on keyboard focus', () => {
      const onPlay = vi.fn()
      const onOptions = vi.fn()
      render(<GameCard game={mockGame} onPlay={onPlay} onOptions={onOptions} />)

      const optionsButton = screen.getByRole('button', { name: /options for super mario bros/i })
      const container = optionsButton.parentElement!
      expect(container.className).toContain('focus-within:opacity-100')
    })

    it('card is keyboard focusable and options button follows in tab order', async () => {
      const user = userEvent.setup()
      const onPlay = vi.fn()
      const onOptions = vi.fn()
      render(<GameCard game={mockGame} onPlay={onPlay} onOptions={onOptions} />)

      // Tab to card
      await user.tab()
      expect(screen.getByRole('button', { name: /play super mario bros/i })).toHaveFocus()

      // Tab to options button
      await user.tab()
      expect(screen.getByRole('button', { name: /options for super mario bros/i })).toHaveFocus()
    })
  })

  describe('interactions', () => {
    it('calls onPlay when card is clicked', async () => {
      const user = userEvent.setup()
      const onPlay = vi.fn()
      render(<GameCard game={mockGame} onPlay={onPlay} />)

      await user.click(screen.getByRole('button', { name: /play super mario bros/i }))
      expect(onPlay).toHaveBeenCalledWith(mockGame)
    })

    it('calls onPlay when Enter is pressed on focused card', async () => {
      const user = userEvent.setup()
      const onPlay = vi.fn()
      render(<GameCard game={mockGame} onPlay={onPlay} />)

      await user.tab()
      await user.keyboard('{Enter}')
      expect(onPlay).toHaveBeenCalledWith(mockGame)
    })

    it('calls onPlay when Space is pressed on focused card', async () => {
      const user = userEvent.setup()
      const onPlay = vi.fn()
      render(<GameCard game={mockGame} onPlay={onPlay} />)

      await user.tab()
      await user.keyboard(' ')
      expect(onPlay).toHaveBeenCalledWith(mockGame)
    })

    it('calls onOptions when Options button is clicked without triggering onPlay', async () => {
      const user = userEvent.setup()
      const onPlay = vi.fn()
      const onOptions = vi.fn()
      render(<GameCard game={mockGame} onPlay={onPlay} onOptions={onOptions} />)

      await user.click(screen.getByRole('button', { name: /options for super mario bros/i }))
      expect(onOptions).toHaveBeenCalledWith(mockGame)
      expect(onPlay).not.toHaveBeenCalled()
    })
  })

  describe('artworkSyncPhase', () => {
    it('shows TV static with sync pulse during hashing phase', () => {
      const onPlay = vi.fn()
      const { container } = render(<GameCard game={mockGame} onPlay={onPlay} artworkSyncStore={storeWithPhase('hashing')} />)

      const staticWrapper = container.querySelector('.absolute.inset-0.transition-opacity')
      expect(staticWrapper).not.toBeNull()
      expect(staticWrapper!.className).toContain('animate-card-sync-pulse')
      expect(screen.getByLabelText(/loading artwork/i)).toBeInTheDocument()
    })

    it('shows TV static with sync pulse during querying phase', () => {
      const onPlay = vi.fn()
      const { container } = render(<GameCard game={mockGame} onPlay={onPlay} artworkSyncStore={storeWithPhase('querying')} />)

      const staticWrapper = container.querySelector('.absolute.inset-0.transition-opacity')
      expect(staticWrapper!.className).toContain('animate-card-sync-pulse')
    })

    it('shows TV static with sync pulse during downloading phase', () => {
      const onPlay = vi.fn()
      const { container } = render(<GameCard game={mockGame} onPlay={onPlay} artworkSyncStore={storeWithPhase('downloading')} />)

      const staticWrapper = container.querySelector('.absolute.inset-0.transition-opacity')
      expect(staticWrapper!.className).toContain('animate-card-sync-pulse')
    })

    it('does not show sync pulse when not actively syncing', () => {
      const onPlay = vi.fn()
      const { container } = render(<GameCard game={mockGame} onPlay={onPlay} />)

      const staticWrapper = container.querySelector('.absolute.inset-0.transition-opacity')
      expect(staticWrapper!.className).not.toContain('animate-card-sync-pulse')
    })

    it('shows "Artwork not found" label and game title during not-found phase', () => {
      const onPlay = vi.fn()
      render(<GameCard game={mockGame} onPlay={onPlay} artworkSyncStore={storeWithPhase('not-found')} />)

      expect(screen.getByText('Artwork not found')).toBeInTheDocument()
      expect(screen.getByText('Super Mario Bros.')).toBeInTheDocument()
    })

    it('shows TV static as fallback when no sync phase and no cover art', () => {
      const onPlay = vi.fn()
      render(<GameCard game={mockGame} onPlay={onPlay} />)

      // Fallback static is active (aria-label from TVStatic)
      expect(screen.getByLabelText(/loading artwork/i)).toBeInTheDocument()
    })

    it('shows game title on fallback card without cover art', () => {
      const onPlay = vi.fn()
      render(<GameCard game={mockGame} onPlay={onPlay} />)

      expect(screen.getByText('Super Mario Bros.')).toBeInTheDocument()
    })

    it('does not show fallback title when cover art exists', () => {
      const onPlay = vi.fn()
      const gameWithArt = { ...mockGame, coverArt: 'artwork://test.png' }
      render(<GameCard game={gameWithArt} onPlay={onPlay} />)

      // The title text overlay should not be rendered (game name only in aria-label/title)
      const titleOverlay = screen.queryByText('Super Mario Bros.')
      // The title exists as aria-label and title attribute, but not as visible text content
      expect(titleOverlay).not.toBeInTheDocument()
    })

    it('cross-fades from static to artwork when done phase fires', async () => {
      vi.useFakeTimers()
      try {
        const onPlay = vi.fn()
        const gameWithArt = { ...mockGame, coverArt: 'artwork://test.png' }
        const { container } = render(
          <GameCard game={gameWithArt} onPlay={onPlay} artworkSyncStore={storeWithPhase('done')} />
        )

        const img = container.querySelector('img')
        expect(img).not.toBeNull()

        // The hook fires onResizeComplete via useLayoutEffect, which schedules
        // an image decode (microtask) → setCrossFadeReady(true). Advance timers
        // to let the hook's cleanup timeout fire, then flush microtasks.
        await act(async () => {
          vi.advanceTimersByTime(500)
          await vi.advanceTimersByTimeAsync(0)
        })

        // Image becomes visible, static wrapper fades out
        expect(img!.className).toContain('opacity-100')

        const staticWrapper = container.querySelector('.absolute.inset-0.transition-opacity')
        expect(staticWrapper).not.toBeNull()
        expect(staticWrapper!.className).toContain('opacity-0')
      } finally {
        vi.useRealTimers()
      }
    })

    it('does not show dissolve animation class when no sync phase', () => {
      const onPlay = vi.fn()
      const gameWithArt = { ...mockGame, coverArt: 'artwork://test.png' }
      const { container } = render(
        <GameCard game={gameWithArt} onPlay={onPlay} />
      )

      const img = container.querySelector('img')
      expect(img).not.toBeNull()
      expect(img!.className).not.toContain('animate-artwork-dissolve-in')
    })
  })

  describe('mosaic layout', () => {
    it('inner container uses aspect-ratio when grid controls height (no explicit style.height)', () => {
      const onPlay = vi.fn()
      const gameWithRatio = { ...mockGame, coverArtAspectRatio: 0.714 }
      const { container } = render(
        <GameCard game={gameWithRatio} onPlay={onPlay} />
      )

      // The outer Card element
      const card = screen.getByRole('button', { name: /play super mario bros/i })
      expect(card.className).toContain('h-full')

      // The inner container should have aspect-ratio set by the hook (not h-full)
      const innerContainer = container.querySelector('.bg-muted')
      expect(innerContainer).not.toBeNull()
      expect(innerContainer!.className).not.toContain('h-full')
      expect((innerContainer as HTMLElement).style.aspectRatio).toBeTruthy()
    })

    it('inner container uses h-full when parent sets explicit pixel height (virtualized)', () => {
      const onPlay = vi.fn()
      const { container } = render(
        <GameCard game={mockGame} onPlay={onPlay} style={{ position: 'absolute', height: 256 }} />
      )

      const innerContainer = container.querySelector('.bg-muted')
      expect(innerContainer).not.toBeNull()
      expect(innerContainer!.className).toContain('h-full')
    })
  })
})
