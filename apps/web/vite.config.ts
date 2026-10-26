import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The API is reached on the same origin (D-031): proxied in development, routed by CloudFront on AWS.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 4100}` } },
});
