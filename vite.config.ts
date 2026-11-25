import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // En dev, /api part vers `npm run pages:dev` : même origine, donc le cookie de session suit.
    proxy: { '/api': 'http://localhost:8790' },
  },
})
