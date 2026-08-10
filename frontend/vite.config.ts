import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const storageMode = env.VITE_STORAGE_MODE ?? (command === 'serve' ? 'auto' : undefined)
  if (storageMode !== 'local' && storageMode !== 'auto') {
    throw new Error('Set VITE_STORAGE_MODE=local for production builds. The auto mode is development-only.')
  }
  if (command === 'build' && storageMode !== 'local') {
    throw new Error('Production builds must use VITE_STORAGE_MODE=local.')
  }

  return {
    define: {
      'import.meta.env.VITE_STORAGE_MODE': JSON.stringify(storageMode),
    },
    plugins: [react()],
    server: {
      proxy: {
        '/api': 'http://localhost:3001',
        '/photos': 'http://localhost:3001',
      },
    },
  }
})
