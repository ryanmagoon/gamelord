import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config
// Note: Tailwind CSS is handled via postcss.config.js instead of @tailwindcss/vite
// because the vite plugin is incompatible with Vite 7 (used by Storybook 10)
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@gamelord/ui'],
  },
});
