import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The API is reached on the same origin (D-031): proxied in development, routed by CloudFront on AWS.
export default defineConfig({
  plugins: [react()],
  server: {
    // Fail rather than move to another port: sign-in (Google's return address, APP_URL) expects
    // 5173, and a second copy left running would quietly keep the old settings (D-066).
    port: 5173,
    strictPort: true,
    proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 4100}` },
  },
});
