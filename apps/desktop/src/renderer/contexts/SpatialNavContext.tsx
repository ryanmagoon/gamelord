import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react'
import { useGamepadUI } from '../hooks/useGamepadUI'
import { useInputDevice, type InputDevice } from '../hooks/useInputDevice'
import {
  findNextFocusable,
  type FocusableRect,
  type Direction,
} from '@gamelord/ui'
import {
  KEYBOARD_UI_MAPPING,
  type UIAction,
} from '../lib/gamepad/ui-mappings'

interface SpatialNavContextValue {
  /** ID of the currently focused element. */
  focusedId: string | null
  /** Move focus to a specific element by ID. */
  setFocusedId: (id: string | null) => void
  /** Whether the focus ring should be visible. */
  showFocusRing: boolean
  /** Last input device used. */
  inputDevice: InputDevice
  /** Bulk-register focusable rects from layout data. */
  registerLayout: (items: FocusableRect[]) => void
  /** Number of connected gamepads. */
  connectedGamepads: number
  /** Ref for the scroll container — attach to the scrollable library element. */
  scrollContainerRef: React.RefObject<HTMLElement | null>
  /** Callback for bumper actions — consumed by LibraryView. */
  onPageAction: ((direction: 'left' | 'right') => void) | null
  /** Set the page action handler (called by LibraryView). */
  setOnPageAction: (handler: (direction: 'left' | 'right') => void) => void
}

const SpatialNavContext = createContext<SpatialNavContextValue | null>(null)

interface SpatialNavProviderProps {
  /** Whether spatial navigation is active (false when a game is running). */
  enabled: boolean
  children: React.ReactNode
}

export function SpatialNavProvider({
  enabled,
  children,
}: SpatialNavProviderProps) {
  const [focusedId, setFocusedIdState] = useState<string | null>(null)
  const focusedIdRef = useRef<string | null>(null)
  const layoutRef = useRef<FocusableRect[]>([])
  const scrollContainerRef = useRef<HTMLElement | null>(null)
  const onPageActionRef = useRef<((direction: 'left' | 'right') => void) | null>(null)

  const { inputDevice, setInputDevice, showFocusRing } = useInputDevice()

  const setFocusedId = useCallback((id: string | null) => {
    focusedIdRef.current = id
    setFocusedIdState(id)
  }, [])

  const registerLayout = useCallback((items: FocusableRect[]) => {
    layoutRef.current = items
  }, [])

  const setOnPageAction = useCallback(
    (handler: (direction: 'left' | 'right') => void) => {
      onPageActionRef.current = handler
    },
    [],
  )

  /**
   * Scrolls the container to ensure the focused item is visible.
   * Uses the layout rect data rather than querying the DOM.
   */
  const scrollToItem = useCallback((rect: FocusableRect) => {
    const container = scrollContainerRef.current
    if (!container) return

    const containerRect = container.getBoundingClientRect()
    const scrollTop = container.scrollTop

    // The rect y is relative to the scroll container's content, not the viewport
    const itemTop = rect.y
    const itemBottom = rect.y + rect.height
    const viewportTop = scrollTop
    const viewportBottom = scrollTop + containerRect.height

    if (itemTop < viewportTop) {
      // Item is above the viewport — scroll up with some padding
      container.scrollTo({ top: Math.max(0, itemTop - 20), behavior: 'smooth' })
    } else if (itemBottom > viewportBottom) {
      // Item is below the viewport — scroll down with some padding
      container.scrollTo({
        top: itemBottom - containerRect.height + 20,
        behavior: 'smooth',
      })
    }
  }, [])

  /**
   * Handles a UI action from the gamepad or keyboard.
   */
  const handleAction = useCallback(
    (action: UIAction) => {
      // Detect if a Radix dialog is open (portal mounted in the DOM)
      const dialogOpen = document.querySelector('[data-radix-portal]') !== null

      if (dialogOpen) {
        // In dialog mode, translate A/B to Enter/Escape for Radix
        if (action === 'select') {
          const el = document.activeElement as HTMLElement | null
          el?.click()
        } else if (action === 'back') {
          document.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: 'Escape',
              code: 'Escape',
              bubbles: true,
            }),
          )
        }
        return
      }

      // Navigation actions
      const directionMap: Record<string, Direction> = {
        'navigate-up': 'up',
        'navigate-down': 'down',
        'navigate-left': 'left',
        'navigate-right': 'right',
      }

      const direction = directionMap[action]
      if (direction) {
        const layout = layoutRef.current
        if (layout.length === 0) return

        const currentId = focusedIdRef.current
        const current = currentId
          ? layout.find((item) => item.id === currentId)
          : null

        if (!current) {
          // No current focus — focus the first item
          const first = layout[0]
          if (first) {
            setFocusedId(first.id)
            scrollToItem(first)
          }
          return
        }

        const next = findNextFocusable(current, layout, direction)
        if (next) {
          setFocusedId(next.id)
          scrollToItem(next)
        }
        return
      }

      // Select action — activate the focused element
      if (action === 'select') {
        const id = focusedIdRef.current
        if (!id) return

        const el = document.querySelector(
          `[data-focusable-id="${id}"]`,
        ) as HTMLElement | null
        el?.click()
        return
      }

      // Back action — close dropdown menus, clear search, etc.
      if (action === 'back') {
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            bubbles: true,
          }),
        )
        return
      }

      // Page actions — cycle system filter tabs
      if (action === 'page-left' || action === 'page-right') {
        const dir = action === 'page-left' ? 'left' : 'right'
        onPageActionRef.current?.(dir)
        return
      }
    },
    [setFocusedId, scrollToItem],
  )

  // Wrap handleAction to also set input device
  const handleGamepadAction = useCallback(
    (action: UIAction) => {
      setInputDevice('gamepad')
      handleAction(action)
    },
    [setInputDevice, handleAction],
  )

  const { connectedCount } = useGamepadUI({
    enabled,
    onAction: handleGamepadAction,
  })

  // Keyboard navigation handler
  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't intercept when typing in an input
      const tag = (event.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if ((event.target as HTMLElement).isContentEditable) return

      const action = KEYBOARD_UI_MAPPING[event.key]
      if (!action) return

      event.preventDefault()
      setInputDevice('keyboard')
      handleAction(action)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, handleAction, setInputDevice])

  const contextValue: SpatialNavContextValue = {
    focusedId,
    setFocusedId,
    showFocusRing,
    inputDevice,
    registerLayout,
    connectedGamepads: connectedCount,
    scrollContainerRef,
    onPageAction: onPageActionRef.current,
    setOnPageAction,
  }

  return (
    <SpatialNavContext.Provider value={contextValue}>
      {children}
    </SpatialNavContext.Provider>
  )
}

export function useSpatialNav(): SpatialNavContextValue {
  const ctx = useContext(SpatialNavContext)
  if (!ctx) {
    throw new Error('useSpatialNav must be used within a SpatialNavProvider')
  }
  return ctx
}
