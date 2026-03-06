import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommandPalette, type CommandAction } from './CommandPalette'
import type { Game } from './GameCard'

const mockGames: Game[] = [
  { id: '1', title: 'Super Mario Bros.', platform: 'NES', romPath: '/roms/smb.nes' },
  { id: '2', title: 'The Legend of Zelda', platform: 'NES', romPath: '/roms/zelda.nes' },
  { id: '3', title: 'Sonic the Hedgehog', platform: 'Genesis', romPath: '/roms/sonic.md' },
  { id: '4', title: 'Street Fighter II', platform: 'SNES', romPath: '/roms/sf2.sfc' },
]

const mockActions: CommandAction[] = [
  { id: 'scan', label: 'Scan Library', group: 'Actions', onSelect: vi.fn() },
  { id: 'settings', label: 'Open Settings', group: 'Actions', onSelect: vi.fn() },
  { id: 'theme', label: 'Toggle Theme', group: 'Settings', onSelect: vi.fn() },
]

function renderPalette(props: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    games: mockGames,
    onSelectGame: vi.fn(),
    actions: mockActions,
  }
  return render(<CommandPalette {...defaultProps} {...props} />)
}

describe('CommandPalette', () => {
  describe('rendering', () => {
    it('renders nothing when closed and never opened', () => {
      const { container } = renderPalette({ open: false })
      expect(container.innerHTML).toBe('')
    })

    it('renders the search input when open', () => {
      renderPalette()
      expect(screen.getByPlaceholderText(/search games/i)).toBeInTheDocument()
    })

    it('renders game titles in the results', () => {
      renderPalette()
      expect(screen.getByText('Super Mario Bros.')).toBeInTheDocument()
      expect(screen.getByText('The Legend of Zelda')).toBeInTheDocument()
      expect(screen.getByText('Sonic the Hedgehog')).toBeInTheDocument()
    })

    it('renders platform names in the results', () => {
      renderPalette()
      // Platform names appear as group items AND as game subtitles, so use getAllByText
      expect(screen.getAllByText('NES').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Genesis').length).toBeGreaterThanOrEqual(1)
    })

    it('renders action labels in the results', () => {
      renderPalette()
      expect(screen.getByText('Scan Library')).toBeInTheDocument()
      expect(screen.getByText('Open Settings')).toBeInTheDocument()
      expect(screen.getByText('Toggle Theme')).toBeInTheDocument()
    })

    it('shows ESC key hint', () => {
      renderPalette()
      expect(screen.getByText('ESC')).toBeInTheDocument()
    })
  })

  describe('search filtering', () => {
    it('filters games by title when typing', async () => {
      const user = userEvent.setup()
      renderPalette()

      const input = screen.getByPlaceholderText(/search games/i)
      await user.type(input, 'mario')

      expect(screen.getByText('Super Mario Bros.')).toBeInTheDocument()
      expect(screen.queryByText('Sonic the Hedgehog')).not.toBeInTheDocument()
    })

    it('filters games by platform when typing', async () => {
      const user = userEvent.setup()
      renderPalette()

      const input = screen.getByPlaceholderText(/search games/i)
      await user.type(input, 'genesis')

      expect(screen.getByText('Sonic the Hedgehog')).toBeInTheDocument()
    })

    it('shows "No results found" for non-matching query', async () => {
      const user = userEvent.setup()
      renderPalette()

      const input = screen.getByPlaceholderText(/search games/i)
      await user.type(input, 'xyznonexistent')

      expect(screen.getByText('No results found.')).toBeInTheDocument()
    })

    it('filters actions by label', async () => {
      const user = userEvent.setup()
      renderPalette()

      const input = screen.getByPlaceholderText(/search games/i)
      await user.type(input, 'settings')

      expect(screen.getByText('Open Settings')).toBeInTheDocument()
    })
  })

  describe('selection', () => {
    it('calls onSelectGame when a game item is selected', async () => {
      const user = userEvent.setup()
      const onSelectGame = vi.fn()
      renderPalette({ onSelectGame })

      await user.click(screen.getByText('Super Mario Bros.'))

      expect(onSelectGame).toHaveBeenCalledWith(mockGames[0])
    })

    it('closes the palette after selecting a game', async () => {
      const user = userEvent.setup()
      const onOpenChange = vi.fn()
      renderPalette({ onOpenChange })

      await user.click(screen.getByText('Super Mario Bros.'))

      expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('calls action.onSelect when an action item is selected', async () => {
      const user = userEvent.setup()
      const scanAction = { id: 'scan', label: 'Scan Library', onSelect: vi.fn() }
      renderPalette({ actions: [scanAction] })

      await user.click(screen.getByText('Scan Library'))

      expect(scanAction.onSelect).toHaveBeenCalled()
    })

    it('closes the palette after selecting an action', async () => {
      const user = userEvent.setup()
      const onOpenChange = vi.fn()
      const scanAction = { id: 'scan', label: 'Scan Library', onSelect: vi.fn() }
      renderPalette({ onOpenChange, actions: [scanAction] })

      await user.click(screen.getByText('Scan Library'))

      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  describe('keyboard navigation', () => {
    it('closes on Escape key', async () => {
      const user = userEvent.setup()
      const onOpenChange = vi.fn()
      renderPalette({ onOpenChange })

      // Focus the input first so the key event reaches the cmdk container
      const input = screen.getByPlaceholderText(/search games/i)
      await user.click(input)
      await user.keyboard('{Escape}')

      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  describe('backdrop', () => {
    it('closes when backdrop is clicked', async () => {
      const user = userEvent.setup()
      const onOpenChange = vi.fn()
      renderPalette({ onOpenChange })

      // The backdrop is the first child div with bg-black/50
      const backdrop = document.querySelector('.fixed.inset-0.bg-black\\/50')
      expect(backdrop).toBeTruthy()
      await user.click(backdrop!)

      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  describe('with no games', () => {
    it('renders without crashing when games array is empty', () => {
      renderPalette({ games: [] })
      expect(screen.getByPlaceholderText(/search games/i)).toBeInTheDocument()
    })

    it('still shows actions when games array is empty', () => {
      renderPalette({ games: [] })
      expect(screen.getByText('Scan Library')).toBeInTheDocument()
    })
  })

  describe('with no actions', () => {
    it('renders without crashing when actions array is empty', () => {
      renderPalette({ actions: [] })
      expect(screen.getByPlaceholderText(/search games/i)).toBeInTheDocument()
    })
  })

  describe('game cover art', () => {
    it('shows cover art image when available', () => {
      const gamesWithArt = [
        { ...mockGames[0], coverArt: 'artwork://cover.png' },
      ]
      renderPalette({ games: gamesWithArt })

      const img = document.querySelector('img')
      expect(img).toBeTruthy()
      expect(img?.getAttribute('src')).toBe('artwork://cover.png')
    })

    it('shows fallback icon when no cover art', () => {
      renderPalette()
      // All mock games have no coverArt, so fallback gamepad icons render
      // Just verify no <img> tags are rendered
      const imgs = document.querySelectorAll('img')
      expect(imgs.length).toBe(0)
    })
  })
})
