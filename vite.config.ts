import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { sites } from '@openai/sites-vite-plugin';

export default defineConfig({
  plugins: [
    react(),
    sites(),
    cloudflare({ viteEnvironment: { name: 'server' } }),
  ],
  server: { port: 5173, host: '127.0.0.1' },
});
