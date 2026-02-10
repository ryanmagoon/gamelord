import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GameCard, Game } from './GameCard'

const mockGame: Game = {
  id: '1',
  title: 'Super Mario Bros.',
  platform: 'NES',
  genre: 'Platform',
  romPath: '/roms/smb.nes',
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
    it('shows TV static during hashing phase', () => {
      const onPlay = vi.fn()
      render(<GameCard game={mockGame} onPlay={onPlay} artworkSyncPhase="hashing" />)

      expect(screen.getByText('Reading...')).toBeInTheDocument()
    })

    it('shows TV static during querying phase', () => {
      const onPlay = vi.fn()
      render(<GameCard game={mockGame} onPlay={onPlay} artworkSyncPhase="querying" />)

      expect(screen.getByText('Searching...')).toBeInTheDocument()
    })

    it('shows TV static during downloading phase', () => {
      const onPlay = vi.fn()
      render(<GameCard game={mockGame} onPlay={onPlay} artworkSyncPhase="downloading" />)

      expect(screen.getByText('Downloading...')).toBeInTheDocument()
    })

    it('shows clean placeholder when no sync phase and no cover art', () => {
      const onPlay = vi.fn()
      render(<GameCard game={mockGame} onPlay={onPlay} />)

      // No TV static visible
      expect(screen.queryByLabelText(/loading artwork/i)).not.toBeInTheDocument()
    })

    it('hides image behind static while resize is in progress during done phase', () => {
      const onPlay = vi.fn()
      const gameWithArt = { ...mockGame, coverArt: 'artwork://test.png' }
      const { container } = render(
        <GameCard game={gameWithArt} onPlay={onPlay} artworkSyncPhase="done" />
      )

      // Image is rendered but hidden (opacity-0) while the height transition
      // runs. The dissolve-in class is added imperatively after resize completes.
      const img = container.querySelector('img')
      expect(img).not.toBeNull()
      expect(img!.className).toContain('opacity-0')
      expect(img!.className).not.toContain('animate-artwork-dissolve-in')
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

  describe('dynamic aspect ratio', () => {
    it('uses coverArtAspectRatio for card aspect ratio when provided', () => {
      const onPlay = vi.fn()
      const gameWithRatio = { ...mockGame, coverArtAspectRatio: 0.714 }
      const { container } = render(
        <GameCard game={gameWithRatio} onPlay={onPlay} />
      )

      const aspectDiv = container.querySelector('[style*="aspect-ratio"]')
      expect(aspectDiv).not.toBeNull()
      expect(aspectDiv!.getAttribute('style')).toContain('0.714')
    })

    it('defaults to 0.75 (3:4) aspect ratio when coverArtAspectRatio is not provided', () => {
      const onPlay = vi.fn()
      const { container } = render(
        <GameCard game={mockGame} onPlay={onPlay} />
      )

      const aspectDiv = container.querySelector('[style*="aspect-ratio"]')
      expect(aspectDiv).not.toBeNull()
      expect(aspectDiv!.getAttribute('style')).toContain('0.75')
    })
  })
})
