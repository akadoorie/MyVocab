import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

/** The app version shown on the home page: "1." + the commit count (D-032). Deploy checks out the
 *  full history so the count is right; without git it falls back to "1.0". */
function appVersion(): string {
  try {
    return `1.${execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim()}`;
  } catch {
    return '1.0';
  }
}

// In development, Vite serves the SPA and proxies /api to `wrangler dev` (port 8787).
// In production, the Worker serves the built dist/ folder and /api from the same origin (PRD §16).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion()) },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
