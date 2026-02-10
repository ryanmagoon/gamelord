import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TVStatic } from './TVStatic'

describe('TVStatic', () => {
  it('renders nothing when not active', () => {
    const { container } = render(<TVStatic active={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the static noise overlay when active', () => {
    render(<TVStatic active={true} />)
    expect(screen.getByLabelText('Loading artwork')).toBeInTheDocument()
  })

  it('renders a canvas element for noise when active', () => {
    const { container } = render(<TVStatic active={true} />)
    const canvas = container.querySelector('canvas')
    expect(canvas).not.toBeNull()
  })

  it('shows status text when provided', () => {
    render(<TVStatic active={true} statusText="Searching..." />)
    expect(screen.getByText('Searching...')).toBeInTheDocument()
  })

  it('uses status text as aria-label when provided', () => {
    render(<TVStatic active={true} statusText="Downloading..." />)
    expect(screen.getByLabelText('Downloading...')).toBeInTheDocument()
  })

  it('does not show status text when not provided', () => {
    const { container } = render(<TVStatic active={true} />)
    // Only the noise, scanline, and glow layers — no text span
    const spans = container.querySelectorAll('span')
    expect(spans.length).toBe(0)
  })

  it('applies red tint for error phase', () => {
    const { container } = render(<TVStatic active={true} phase="error" />)
    const redOverlay = container.querySelector('.bg-red-500\\/15')
    expect(redOverlay).not.toBeNull()
  })

  it('applies amber tint for not-found phase', () => {
    const { container } = render(<TVStatic active={true} phase="not-found" />)
    const amberOverlay = container.querySelector('.bg-amber-500\\/15')
    expect(amberOverlay).not.toBeNull()
  })

  it('does not apply color tint for normal sync phases', () => {
    const { container } = render(<TVStatic active={true} phase="querying" />)
    expect(container.querySelector('.bg-red-500\\/15')).toBeNull()
    expect(container.querySelector('.bg-amber-500\\/15')).toBeNull()
  })
})
