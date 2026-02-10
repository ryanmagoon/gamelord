import { useCallback, useRef, useSyncExternalStore } from 'react'
import type { ArtworkSyncPhase } from '../components/TVStatic'

type Listener = () => void

/**
 * External store for per-game artwork sync phases.
 *
 * Decouples phase updates from React's render cycle so that changing one
 * game's phase only re-renders that game's card — not the entire library
 * grid. Built on `useSyncExternalStore` for tear-free reads.
 */
export class ArtworkSyncStore {
  private phases = new Map<string, ArtworkSyncPhase>()
  private listeners = new Set<Listener>()

  /** Get the current phase for a game. */
  getPhase(gameId: string): ArtworkSyncPhase | undefined {
    return this.phases.get(gameId)
  }

  /** Update a game's phase and notify subscribers. */
  setPhase(gameId: string, phase: ArtworkSyncPhase | null) {
    if (phase === null) {
      this.phases.delete(gameId)
    } else {
      this.phases.set(gameId, phase)
    }
    this.notify()
  }

  /** Clear all phases. */
  clear() {
    this.phases.clear()
    this.notify()
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify() {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

/**
 * Hook that subscribes a component to a specific game's artwork sync phase.
 *
 * Only triggers a re-render when this game's phase actually changes —
 * phase changes for other games are ignored via the selector pattern.
 */
export function useArtworkSyncPhase(
  store: ArtworkSyncStore | undefined,
  gameId: string,
): ArtworkSyncPhase | undefined {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!store) return () => {}
      return store.subscribe(onStoreChange)
    },
    [store],
  )

  // Cache the previous value so useSyncExternalStore can skip re-renders
  // when this specific game's phase hasn't changed (even though the store
  // notified all subscribers).
  const prevRef = useRef<ArtworkSyncPhase | undefined>(undefined)

  const getSnapshot = useCallback(() => {
    const current = store?.getPhase(gameId)
    // Return the same reference if the value hasn't changed, so
    // useSyncExternalStore's Object.is comparison skips the re-render.
    if (current === prevRef.current) return prevRef.current
    prevRef.current = current
    return current
  }, [store, gameId])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
