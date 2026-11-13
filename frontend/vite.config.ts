import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// FastAPI serves dist/index.html at / and dist/assets at /assets (see app/main.py).
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: { outDir: 'dist', emptyOutDir: true },
  // `npm run dev` proxies the API to a backend started with start.sh / start.ps1.
  server: { proxy: { '/api': 'http://127.0.0.1:8000', '/reference.html': 'http://127.0.0.1:8000' } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
