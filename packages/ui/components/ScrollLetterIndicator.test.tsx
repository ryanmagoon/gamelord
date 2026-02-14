import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScrollLetterIndicator } from './ScrollLetterIndicator'

describe('ScrollLetterIndicator', () => {
  it('renders nothing when letter is null', () => {
    const { container } = render(
      <ScrollLetterIndicator letter={null} isVisible={true} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the letter text', () => {
    render(<ScrollLetterIndicator letter="A" isVisible={true} />)
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('has aria-hidden="true"', () => {
    render(<ScrollLetterIndicator letter="M" isVisible={true} />)
    const indicator = screen.getByTestId('scroll-letter-indicator')
    expect(indicator).toHaveAttribute('aria-hidden', 'true')
  })

  it('has pointer-events-none class', () => {
    render(<ScrollLetterIndicator letter="Z" isVisible={true} />)
    const indicator = screen.getByTestId('scroll-letter-indicator')
    expect(indicator.className).toContain('pointer-events-none')
  })

  it('applies opacity-100 when visible', () => {
    render(<ScrollLetterIndicator letter="B" isVisible={true} />)
    const indicator = screen.getByTestId('scroll-letter-indicator')
    expect(indicator.className).toContain('opacity-100')
    expect(indicator.className).not.toContain('opacity-0')
  })

  it('applies opacity-0 when not visible', () => {
    render(<ScrollLetterIndicator letter="B" isVisible={false} />)
    const indicator = screen.getByTestId('scroll-letter-indicator')
    expect(indicator.className).toContain('opacity-0')
    expect(indicator.className).not.toContain('opacity-100')
  })

  it('applies scale-100 when visible and scale-90 when not', () => {
    const { rerender } = render(
      <ScrollLetterIndicator letter="C" isVisible={true} />,
    )
    expect(screen.getByText('C').className).toContain('scale-100')

    rerender(<ScrollLetterIndicator letter="C" isVisible={false} />)
    expect(screen.getByText('C').className).toContain('scale-90')
  })
})
