import { useCallback, useState } from 'react'
import { GitBranch, FolderGit2, Check } from 'lucide-react'

type CopiedField = 'branch' | 'worktree' | null

interface DevBranchBadgeProps {
  /** Visual variant. `titlebar` for the library header, `overlay` for the game window HUD. */
  variant?: 'titlebar' | 'overlay'
}

const STYLES = {
  titlebar: {
    container: 'no-drag inline-flex items-center rounded-full border border-border/50 bg-muted/50 text-[10px] font-medium text-muted-foreground/70',
    branchButton: 'inline-flex items-center gap-1.5 rounded-l-full py-0.5 pl-2.5 pr-2 transition-colors hover:bg-muted hover:text-muted-foreground',
    worktreeButton: 'inline-flex items-center gap-1 border-l border-border/50 rounded-r-full py-0.5 pl-1.5 pr-2.5 transition-colors hover:bg-muted hover:text-muted-foreground',
    divider: 'border-border/50',
  },
  overlay: {
    container: 'inline-flex items-center rounded-full bg-black/60 text-[10px] font-medium text-white/70 pointer-events-auto',
    branchButton: 'inline-flex items-center gap-1.5 rounded-l-full py-0.5 pl-2.5 pr-2 transition-colors hover:bg-white/20 hover:text-white',
    worktreeButton: 'inline-flex items-center gap-1 border-l border-white/20 rounded-r-full py-0.5 pl-1.5 pr-2.5 transition-colors hover:bg-white/20 hover:text-white',
    divider: 'border-white/20',
  },
} as const

/**
 * Dev-only badge showing the git branch and worktree name.
 * Helps distinguish between multiple running worktree instances.
 * Each segment is independently clickable to copy its value.
 */
export function DevBranchBadge({ variant = 'titlebar' }: DevBranchBadgeProps) {
  const branch = __DEV_GIT_BRANCH__
  const worktree = __DEV_WORKTREE_NAME__
  const worktreePath = __DEV_WORKTREE_PATH__
  const [copied, setCopied] = useState<CopiedField>(null)

  const copyValue = useCallback((value: string, field: CopiedField) => {
    navigator.clipboard.writeText(value)
    setCopied(field)
    setTimeout(() => setCopied(null), 1500)
  }, [])

  if (!branch) return null

  const s = STYLES[variant]
  const soloRounding = worktree ? 'rounded-l-full' : 'rounded-full'

  return (
    <div className={s.container}>
      {/* Branch segment */}
      <button
        type="button"
        onClick={() => copyValue(branch, 'branch')}
        title={copied === 'branch' ? 'Copied!' : 'Click to copy branch name'}
        className={`${s.branchButton.replace('rounded-l-full', soloRounding)}`}
      >
        {copied === 'branch' ? (
          <Check className="h-3 w-3 text-green-500" />
        ) : (
          <GitBranch className="h-3 w-3" />
        )}
        <span className="max-w-[200px] truncate font-mono">{branch}</span>
      </button>

      {/* Worktree segment */}
      {worktree && (
        <button
          type="button"
          onClick={() => copyValue(worktreePath ?? worktree, 'worktree')}
          title={copied === 'worktree' ? 'Copied!' : 'Click to copy worktree path'}
          className={s.worktreeButton}
        >
          {copied === 'worktree' ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <FolderGit2 className="h-3 w-3" />
          )}
          <span className="max-w-[150px] truncate font-mono">{worktree}</span>
        </button>
      )}
    </div>
  )
}
