import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4000',
      '/ws': {
        target: 'ws://127.0.0.1:4000',
        ws: true,
      },
    },
  },
})
