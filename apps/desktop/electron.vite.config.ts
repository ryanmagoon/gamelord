import { resolve } from 'path'
import { execSync } from 'child_process'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

function getGitBranch(): string | null {
  try {
    return execSync('git branch --show-current', { encoding: 'utf-8' }).trim() || null
  } catch {
    return null
  }
}

function getWorktreeName(): string | null {
  const match = process.cwd().match(/\.claude\/worktrees\/([^/]+)/)
  return match?.[1] ?? null
}

function getLatestCommitSubject(): string | null {
  try {
    return execSync('git log -1 --format=%s', { encoding: 'utf-8' }).trim() || null
  } catch {
    return null
  }
}

const isDev = process.env.NODE_ENV !== 'production'
const gitBranch = isDev ? getGitBranch() : null
const worktreeName = isDev ? getWorktreeName() : null
const commitSubject = isDev ? getLatestCommitSubject() : null

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main.ts'),
          'workers/core-worker': resolve(__dirname, 'src/main/workers/core-worker.ts'),
        },
        external: [/\.node$/],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload.ts'),
        },
      },
    },
  },
  renderer: {
    root: '.',
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
          'game-window': resolve(__dirname, 'game-window.html'),
        },
      },
    },
    plugins: [react()],
    define: {
      __DEV_GIT_BRANCH__: JSON.stringify(gitBranch),
      __DEV_WORKTREE_NAME__: JSON.stringify(worktreeName),
      __DEV_COMMIT_SUBJECT__: JSON.stringify(commitSubject),
    },
    resolve: {
      // Ensure pnpm workspace symlinks (e.g. @gamelord/ui → packages/ui)
      // resolve to their real paths, so Node module resolution walks up from
      // the real package directory to the root node_modules where pnpm
      // installs transitive dependencies.
      preserveSymlinks: false,
    },
    optimizeDeps: {
      exclude: ['@gamelord/ui'],
    },
  },
})
