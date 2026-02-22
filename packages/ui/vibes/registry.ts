import type { VibeDefinition, VibeId } from './types'

export const VIBE_REGISTRY: VibeDefinition[] = [
  {
    id: 'default',
    label: 'Default',
    icon: '✨',
    colorSchemes: ['light', 'dark'],
    hasPointerGlow: false,
    hasScanlines: false,
  },
  {
    id: 'unc',
    label: 'Unc Mode',
    icon: '👴',
    colorSchemes: ['dark'],
    hasPointerGlow: true,
    hasScanlines: true,
  },
]

/** Look up a vibe definition by ID. Falls back to default if not found. */
export function getVibeDefinition(id: string): VibeDefinition {
  return VIBE_REGISTRY.find((v) => v.id === id) ?? VIBE_REGISTRY[0]
}

/** Read the current vibe ID from localStorage. */
export function getSavedVibeId(): VibeId {
  const saved = localStorage.getItem('gamelord:vibe')
  if (saved && VIBE_REGISTRY.some((v) => v.id === saved)) {
    return saved as VibeId
  }
  return 'default'
}
