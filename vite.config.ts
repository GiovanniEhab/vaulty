import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Extra hostnames the dev server may answer to, supplied per process so no
 * preview hostname is committed. Comma separated, exact matches only.
 */
const extraAllowedHosts = (process.env.VITE_PREVIEW_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: extraAllowedHosts,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
});
