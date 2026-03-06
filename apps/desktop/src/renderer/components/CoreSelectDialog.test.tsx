import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CoreSelectDialog, CoreSelectDialogProps } from './CoreSelectDialog'
import type { CoreInfo } from '../types/global'

const MOCK_CORES: Array<CoreInfo> = [
  {
    description: 'Fast, highly compatible. Best for most games.',
    displayName: 'Snes9x',
    installed: true,
    name: 'snes9x_libretro',
  },
  {
    description: 'Cycle-accurate. Perfect accuracy, higher CPU usage.',
    displayName: 'bsnes',
    installed: false,
    name: 'bsnes_libretro',
  },
]

function renderDialog(overrides: Partial<CoreSelectDialogProps> = {}) {
  const defaultProps: CoreSelectDialogProps = {
    cores: MOCK_CORES,
    onCancel: vi.fn(),
    onSelect: vi.fn(),
    open: true,
    systemName: 'SNES',
  }

  const props = { ...defaultProps, ...overrides }
  const result = render(<CoreSelectDialog {...props} />)
  return { ...result, props }
}

describe('CoreSelectDialog', () => {
  it('renders the dialog title and system name', () => {
    renderDialog()

    expect(screen.getByText('Choose Emulator Core')).toBeTruthy()
    expect(screen.getByText('SNES')).toBeTruthy()
  })

  it('renders all available cores with display names', () => {
    renderDialog()

    expect(screen.getByText('Snes9x')).toBeTruthy()
    expect(screen.getByText('bsnes')).toBeTruthy()
  })

  it('renders core descriptions', () => {
    renderDialog()

    expect(
      screen.getByText('Fast, highly compatible. Best for most games.'),
    ).toBeTruthy()
    expect(
      screen.getByText(
        'Cycle-accurate. Perfect accuracy, higher CPU usage.',
      ),
    ).toBeTruthy()
  })

  it('calls onSelect with core name and remember=false when a core is clicked', () => {
    const onSelect = vi.fn()
    renderDialog({ onSelect })

    fireEvent.click(screen.getByText('Snes9x'))

    expect(onSelect).toHaveBeenCalledWith('snes9x_libretro', false)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('calls onSelect with remember=true when checkbox is checked first', () => {
    const onSelect = vi.fn()
    renderDialog({ onSelect })

    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByText('bsnes'))

    expect(onSelect).toHaveBeenCalledWith('bsnes_libretro', true)
  })

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn()
    renderDialog({ onCancel })

    fireEvent.click(screen.getByText('Cancel'))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('does not render dialog content when open is false', () => {
    renderDialog({ open: false })

    // The AlertDialog wrapper returns null when open starts as false
    // (the dialog was never opened), so nothing should be in the DOM.
    expect(screen.queryByText('Choose Emulator Core')).toBeNull()
  })

  it('handles cores without descriptions', () => {
    const coresWithoutDescription: Array<CoreInfo> = [
      {
        description: '',
        displayName: 'Test Core',
        installed: true,
        name: 'test_core',
      },
    ]
    renderDialog({ cores: coresWithoutDescription })

    expect(screen.getByText('Test Core')).toBeTruthy()
  })

  it('renders the remember checkbox unchecked by default', () => {
    renderDialog()

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(false)
  })

  it('shows loading state when cores array is empty', () => {
    renderDialog({ cores: [] })

    expect(screen.getByText('Loading available cores\u2026')).toBeTruthy()
    // Should not show core buttons
    expect(screen.queryByText('Snes9x')).toBeNull()
    expect(screen.queryByText('bsnes')).toBeNull()
  })

  it('disables the remember checkbox during loading', () => {
    renderDialog({ cores: [] })

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox.disabled).toBe(true)
  })

  it('does not show loading state when cores are provided', () => {
    renderDialog()

    expect(screen.queryByText('Loading available cores\u2026')).toBeNull()
    expect(screen.getByText('Snes9x')).toBeTruthy()
  })
})
