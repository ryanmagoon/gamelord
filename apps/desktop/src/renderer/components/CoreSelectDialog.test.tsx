import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CoreSelectDialog, CoreSelectDialogProps } from './CoreSelectDialog'
import type { CoreInfo } from '../types/global'

const MOCK_CORES: CoreInfo[] = [
  {
    name: 'snes9x_libretro',
    displayName: 'Snes9x',
    description: 'Fast, highly compatible. Best for most games.',
    installed: true,
  },
  {
    name: 'bsnes_libretro',
    displayName: 'bsnes',
    description: 'Cycle-accurate. Perfect accuracy, higher CPU usage.',
    installed: false,
  },
]

function renderDialog(overrides: Partial<CoreSelectDialogProps> = {}) {
  const defaultProps: CoreSelectDialogProps = {
    open: true,
    systemName: 'SNES',
    cores: MOCK_CORES,
    onSelect: vi.fn(),
    onCancel: vi.fn(),
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

    expect(screen.queryByText('Choose Emulator Core')).toBeNull()
  })

  it('handles cores without descriptions', () => {
    const coresWithoutDescription: CoreInfo[] = [
      {
        name: 'test_core',
        displayName: 'Test Core',
        description: '',
        installed: true,
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
})
