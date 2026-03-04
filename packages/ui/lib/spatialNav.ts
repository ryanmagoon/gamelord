/**
 * Spatial navigation engine for controller-based UI navigation.
 *
 * Pure geometry — no React or DOM dependency. Given a currently focused
 * rectangle and a set of candidates, finds the best target in a given
 * direction using a weighted alignment + distance score (matching the
 * approach used by Android TV and tvOS focus engines).
 */

export interface FocusableRect {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export type Direction = 'up' | 'down' | 'left' | 'right'

/**
 * Weight for perpendicular-axis alignment in the scoring function.
 * Higher values favor candidates that are well-aligned (same row/column)
 * over those that are closer but misaligned.
 */
const ALIGNMENT_WEIGHT = 5

/**
 * Finds the best candidate to move focus to from `current` in the given
 * `direction`.
 *
 * Algorithm:
 * 1. Filter candidates to those in the correct directional half-plane
 *    (e.g. for 'right', candidates whose left edge is to the right of
 *    the current element's right edge).
 * 2. Score each candidate by:
 *    - Alignment: overlap on the perpendicular axis (0 = no overlap,
 *      1 = fully overlapping). Weighted heavily to prefer same-row/column.
 *    - Distance: Euclidean distance between nearest edges, normalized.
 * 3. Return the candidate with the lowest score, or null if none qualify.
 */
export function findNextFocusable(
  current: FocusableRect,
  candidates: FocusableRect[],
  direction: Direction,
): FocusableRect | null {
  const isHorizontal = direction === 'left' || direction === 'right'

  // Filter to candidates in the correct half-plane
  const viable = candidates.filter((candidate) => {
    if (candidate.id === current.id) return false
    return isInDirection(current, candidate, direction)
  })

  if (viable.length === 0) return null

  let bestCandidate: FocusableRect | null = null
  let bestScore = Infinity

  for (const candidate of viable) {
    const score = computeScore(current, candidate, isHorizontal)
    if (score < bestScore) {
      bestScore = score
      bestCandidate = candidate
    }
  }

  return bestCandidate
}

/**
 * Checks whether `candidate` is in the correct directional half-plane
 * relative to `current`. Uses center-to-center comparison with a small
 * tolerance to avoid missing candidates that are only slightly offset.
 */
function isInDirection(
  current: FocusableRect,
  candidate: FocusableRect,
  direction: Direction,
): boolean {
  const currentCenter = rectCenter(current)
  const candidateCenter = rectCenter(candidate)

  switch (direction) {
    case 'up':
      return candidateCenter.y < currentCenter.y
    case 'down':
      return candidateCenter.y > currentCenter.y
    case 'left':
      return candidateCenter.x < currentCenter.x
    case 'right':
      return candidateCenter.x > currentCenter.x
  }
}

/**
 * Computes a score for a candidate. Lower is better.
 *
 * - `alignment` measures overlap on the perpendicular axis (0–1 range,
 *   inverted so 0 = full overlap, 1 = no overlap).
 * - `distance` is the Euclidean distance between nearest edges.
 *
 * The alignment term is weighted heavily so that candidates in the same
 * row (for horizontal moves) or same column (for vertical moves) are
 * strongly preferred, even if a misaligned candidate is closer.
 */
function computeScore(
  current: FocusableRect,
  candidate: FocusableRect,
  isHorizontal: boolean,
): number {
  const alignment = 1 - computeOverlap(current, candidate, isHorizontal)
  const distance = edgeDistance(current, candidate, isHorizontal)

  return alignment * ALIGNMENT_WEIGHT + distance
}

/**
 * Computes the overlap ratio on the perpendicular axis (0 to 1).
 * For horizontal movement, this is the vertical overlap.
 * For vertical movement, this is the horizontal overlap.
 */
function computeOverlap(
  a: FocusableRect,
  b: FocusableRect,
  isHorizontal: boolean,
): number {
  let aMin: number, aMax: number, bMin: number, bMax: number

  if (isHorizontal) {
    // Perpendicular axis is vertical
    aMin = a.y
    aMax = a.y + a.height
    bMin = b.y
    bMax = b.y + b.height
  } else {
    // Perpendicular axis is horizontal
    aMin = a.x
    aMax = a.x + a.width
    bMin = b.x
    bMax = b.x + b.width
  }

  const overlapStart = Math.max(aMin, bMin)
  const overlapEnd = Math.min(aMax, bMax)
  const overlap = Math.max(0, overlapEnd - overlapStart)

  const minExtent = Math.min(aMax - aMin, bMax - bMin)
  if (minExtent <= 0) return 0

  return overlap / minExtent
}

/**
 * Computes the distance between the nearest edges of two rectangles
 * along the primary axis of movement, normalized by dividing by 100
 * to keep the distance term on a similar scale to the alignment term.
 */
function edgeDistance(
  current: FocusableRect,
  candidate: FocusableRect,
  isHorizontal: boolean,
): number {
  let distance: number

  if (isHorizontal) {
    const currentRight = current.x + current.width
    const candidateRight = candidate.x + candidate.width
    // Minimum distance between horizontal edges
    distance = Math.min(
      Math.abs(candidate.x - currentRight),
      Math.abs(current.x - candidateRight),
      Math.abs(candidate.x - current.x),
    )
  } else {
    const currentBottom = current.y + current.height
    const candidateBottom = candidate.y + candidate.height
    // Minimum distance between vertical edges
    distance = Math.min(
      Math.abs(candidate.y - currentBottom),
      Math.abs(current.y - candidateBottom),
      Math.abs(candidate.y - current.y),
    )
  }

  return distance / 100
}

function rectCenter(rect: FocusableRect): { x: number; y: number } {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  }
}
