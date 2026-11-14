import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  // The voice backend (uvicorn backend.main:app) holds the ElevenLabs key; the browser only sees /api.
  server: { host: '127.0.0.1', port: 5173, proxy: { '/api': 'http://127.0.0.1:8000' } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
