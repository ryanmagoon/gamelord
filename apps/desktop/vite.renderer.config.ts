import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config
// Note: Tailwind CSS is handled via postcss.config.js instead of @tailwindcss/vite
// because the vite plugin is incompatible with Vite 7 (used by Storybook 10)
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Override Electron Forge's default preserveSymlinks: true so that
    // pnpm workspace symlinks (e.g. @gamelord/ui → packages/ui) resolve
    // to their real paths. This lets Node module resolution walk up from
    // the real package directory to the root node_modules, where pnpm
    // installs transitive dependencies.
    // See: https://github.com/electron/forge/blob/v7.8.1/packages/plugin/vite/src/config/vite.renderer.config.ts#L18
    preserveSymlinks: false,
  },
  optimizeDeps: {
    exclude: ['@gamelord/ui'],
  },
});
