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
    it('renders Play button with aria-label containing game title', () => {
      const onPlay = vi.fn()
      render(<GameCard game={mockGame} onPlay={onPlay} />)

      const playButton = screen.getByRole('button', { name: /play super mario bros/i })
      expect(playButton).toBeInTheDocument()
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

    it('Options button has focus:opacity-100 class for keyboard accessibility', () => {
      const onPlay = vi.fn()
      const onOptions = vi.fn()
      render(<GameCard game={mockGame} onPlay={onPlay} onOptions={onOptions} />)

      const optionsButton = screen.getByRole('button', { name: /options for super mario bros/i })
      expect(optionsButton.className).toContain('focus:opacity-100')
    })

    it('all interactive elements are keyboard focusable', async () => {
      const user = userEvent.setup()
      const onPlay = vi.fn()
      const onOptions = vi.fn()
      render(<GameCard game={mockGame} onPlay={onPlay} onOptions={onOptions} />)

      // Tab to first button (Play)
      await user.tab()
      expect(screen.getByRole('button', { name: /play super mario bros/i })).toHaveFocus()

      // Tab to second button (Options)
      await user.tab()
      expect(screen.getByRole('button', { name: /options for super mario bros/i })).toHaveFocus()
    })
  })

  describe('interactions', () => {
    it('calls onPlay when Play button is clicked', async () => {
      const user = userEvent.setup()
      const onPlay = vi.fn()
      render(<GameCard game={mockGame} onPlay={onPlay} />)

      await user.click(screen.getByRole('button', { name: /play super mario bros/i }))
      expect(onPlay).toHaveBeenCalledWith(mockGame)
    })

    it('calls onOptions when Options button is clicked', async () => {
      const user = userEvent.setup()
      const onPlay = vi.fn()
      const onOptions = vi.fn()
      render(<GameCard game={mockGame} onPlay={onPlay} onOptions={onOptions} />)

      await user.click(screen.getByRole('button', { name: /options for super mario bros/i }))
      expect(onOptions).toHaveBeenCalledWith(mockGame)
    })

    it('Play button can be activated with keyboard', async () => {
      const user = userEvent.setup()
      const onPlay = vi.fn()
      render(<GameCard game={mockGame} onPlay={onPlay} />)

      await user.tab()
      await user.keyboard('{Enter}')
      expect(onPlay).toHaveBeenCalledWith(mockGame)
    })
  })
})
