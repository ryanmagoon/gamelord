import { useState, useEffect, useCallback, useRef } from 'react'

export type InputDevice = 'mouse' | 'gamepad' | 'keyboard'

/**
 * Tracks the most recently used input device to control visual affordances.
 *
 * - Mouse movement → 'mouse' (focus ring hidden)
 * - Gamepad action → 'gamepad' (focus ring shown)
 * - Keyboard navigation → 'keyboard' (focus ring shown)
 *
 * Does NOT affect which inputs work — both always work simultaneously.
 * Only controls visibility of the focus ring and button prompts.
 */
export function useInputDevice(): {
  inputDevice: InputDevice
  setInputDevice: (device: InputDevice) => void
  showFocusRing: boolean
} {
  const [inputDevice, setInputDeviceState] = useState<InputDevice>('mouse')
  const currentRef = useRef<InputDevice>('mouse')

  const setInputDevice = useCallback((device: InputDevice) => {
    if (currentRef.current === device) return
    currentRef.current = device
    setInputDeviceState(device)
  }, [])

  // Track mouse movement — only update state on device change
  useEffect(() => {
    const handleMouseMove = () => {
      if (currentRef.current !== 'mouse') {
        currentRef.current = 'mouse'
        setInputDeviceState('mouse')
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  return {
    inputDevice,
    setInputDevice,
    showFocusRing: inputDevice === 'gamepad' || inputDevice === 'keyboard',
  }
}
