import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { sites } from '@openai/sites-vite-plugin';

/**
 * In production the D1 database and R2 bucket are provided by OpenAI Sites (.openai/hosting.json).
 * For `pnpm dev` we add local, file-backed bindings so persistence, shopping plans and cart
 * synchronisation work on a laptop. These never end up in the deployed configuration.
 */
const localDevBindings = {
  d1_databases: [{ binding: 'DB', database_name: 'project73-local', database_id: 'project73-local' }],
  r2_buckets: [{ binding: 'MEDIA', bucket_name: 'project73-local-media' }],
};

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    sites(),
    cloudflare({ viteEnvironment: { name: 'server' }, ...(command === 'serve' ? { config: localDevBindings } : {}) }),
  ],
  server: { port: 5173, host: '127.0.0.1' },
}));
