import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development /api calls go to dev-server.mjs (port 3001); on Vercel they hit the serverless functions.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3001' } },
  preview: { port: 4173, proxy: { '/api': 'http://localhost:3001' } },
  build: { chunkSizeWarningLimit: 900 },
});
