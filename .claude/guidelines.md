# Claude Code Guidelines for GameLord

## Git Workflow

### Commit Frequency
- Commit after completing logical chunks of work
- Commit at the end of each major feature
- Commit before any significant refactoring
- Commit at the end of each coding session
- **Proactively suggest commits** at natural breakpoints

### Commit Message Format
```
<type>: <short description>

<detailed explanation of what changed and why>

<any breaking changes or important notes>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Types:** feat, fix, refactor, docs, test, chore

### Push Strategy
- Push to remote after each commit
- Ensure work is always backed up
- Make it easy to share progress

### Example Workflow
```bash
# After completing a feature
git add -A
git commit -m "feat: add feature description"
git push origin <branch-name>
```

## Code Style

### Technology Stack
- **TypeScript** with strict mode
- **React 19** with hooks
- **Tailwind CSS v4** for all styling
- **shadcn/ui** components
- **lucide-react** for icons
- **Electron 37** for desktop app

### File Organization
- Colocate tests with source files
- Use TypeScript for all new code
- Follow existing patterns in the codebase

### Component Style
```tsx
// Always use Tailwind classes, never inline styles
// Use shadcn/ui components for consistency
// Destructure props in function signature

import { Button } from '@gamelord/ui'
import { Icon } from 'lucide-react'

export function Component({ prop }: { prop: string }) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost">
        <Icon className="h-4 w-4" />
        {prop}
      </Button>
    </div>
  )
}
```

## Development Workflow

### Daily Goals
- Work in 3-5 hour sessions
- Complete measurable milestones each day
- Update DEVELOPMENT_PLAN.md with progress

### Testing
- Test major features before committing
- Ensure app builds successfully
- Verify no TypeScript errors

### Communication
- Be concise and direct
- Explain technical decisions when relevant
- Ask clarifying questions when requirements are unclear

## Project-Specific Notes

### Architecture
- Native libretro cores loaded via dlopen (N-API addon)
- Main process drives emulation loop at core's native FPS
- Frames/audio pushed to renderer via `webContents.send` + `Buffer`
- Renderer displays via canvas `putImageData` + Web Audio API
- Legacy overlay mode for external RetroArch process still supported

### Key Principles
- OpenEmu-style user experience
- Native performance for emulation
- Cohesive UI across all windows
- Actively maintained emulator cores

---

Last updated: 2026-01-28
