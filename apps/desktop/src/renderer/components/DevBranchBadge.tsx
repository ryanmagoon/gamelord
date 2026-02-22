import { useCallback, useState } from 'react'
import { GitBranch, Check } from 'lucide-react'

/**
 * Dev-only badge showing the latest commit subject and git branch.
 * Helps distinguish between multiple running worktree instances.
 * The commit subject is the primary label (describes the feature);
 * the branch name appears as secondary context.
 * Clicking copies the branch name to clipboard.
 */
export function DevBranchBadge() {
  const branch = __DEV_GIT_BRANCH__
  const commitSubject = __DEV_COMMIT_SUBJECT__
  const [copied, setCopied] = useState(false)

  const handleClick = useCallback(() => {
    if (!branch) return
    navigator.clipboard.writeText(branch)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [branch])

  if (!branch) return null

  const primaryLabel = commitSubject ?? branch

  return (
    <button
      type="button"
      onClick={handleClick}
      title={copied ? 'Copied!' : `${branch}\nClick to copy branch name`}
      className="no-drag inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/50 px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground/70 transition-colors hover:bg-muted hover:text-muted-foreground"
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <GitBranch className="h-3 w-3" />
      )}
      <span className="max-w-[300px] truncate font-mono">{primaryLabel}</span>
    </button>
  )
}
