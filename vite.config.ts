import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import pkg from './package.json';

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react()],
  // The practice battle worker imports the simulator, which needs ES module output.
  worker: { format: 'es' },
  // The simulator's battle cloning (State.deserializeBattle) finds objects by
  // class name, so minification must keep names.
  esbuild: { keepNames: true },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // @pkmn/sim was written for Node and reads `global` in a few places.
    global: 'globalThis',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer/src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
