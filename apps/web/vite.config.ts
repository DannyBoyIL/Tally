import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the UI calls /api/* on its own origin and Vite forwards it to the API server,
// so there is no CORS to configure. API_URL lets E2E point at an API on another port.
export default defineConfig({
  plugins: [react()],
  server: {
    // IPv4 explicitly: "localhost" can resolve to ::1 only, and the API proxy and E2E use 127.0.0.1.
    host: '127.0.0.1',
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    proxy: { '/api': process.env.API_URL ?? 'http://127.0.0.1:3000' },
  },
});
