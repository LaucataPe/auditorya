import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Separa las librerías estables en chunks propios: bundle de entrada más liviano
        // y mejor caché (el vendor cambia poco entre despliegues). `docx` sigue en su
        // chunk perezoso (import dinámico), no entra aquí.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'data-vendor': ['@tanstack/react-query', 'zustand'],
          icons: ['lucide-react'],
        },
      },
    },
  },
})
