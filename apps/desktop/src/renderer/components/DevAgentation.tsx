import { lazy, Suspense } from 'react'

const Agentation = lazy(() =>
  import('agentation').then((mod) => ({ default: mod.Agentation }))
)

export function DevAgentation() {
  if (process.env.NODE_ENV !== 'development') return null
  return (
    <Suspense fallback={null}>
      <Agentation endpoint="http://localhost:4747" copyToClipboard={true} />
    </Suspense>
  )
}
