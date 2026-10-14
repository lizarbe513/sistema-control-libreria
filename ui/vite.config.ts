import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// Tauri espera un puerto fijo y no limpia la consola (para ver los errores de Rust).
export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: { port: 5175, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    // WebView2 (Windows 10/11) y WebKitGTK modernos
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
