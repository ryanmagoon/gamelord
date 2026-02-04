import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config
export default defineConfig(async () => {
  const { default: tailwindcss } = await import('@tailwindcss/vite');
  return {
    plugins: [react(), tailwindcss()],
    optimizeDeps: {
      exclude: ['@gamelord/ui'],
    },
    build: {
      rollupOptions: {
        input: 'game-window.html',
      },
    },
  };
});
