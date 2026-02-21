import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

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
