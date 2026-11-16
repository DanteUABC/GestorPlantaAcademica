import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export const pwaOptions = {
  registerType: 'autoUpdate',
  includeAssets: ['favicon.ico', 'pwa-192x192.png', 'pwa-512x512.png'],
  manifest: {
    name: 'Pavilion - Gestor de Planta Académica',
    short_name: 'Pavilion',
    description: 'Sistema de Gestión de Planta Académica y Horarios',
    theme_color: '#1976D2',
    background_color: '#ffffff',
    display: 'standalone',
    start_url: '/',
    icons: [
      {
        src: 'pwa-192x192.png',
        sizes: '192x192',
        type: 'image/png'
      },
      {
        src: 'pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png'
      }
    ]
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,eot}'],
    runtimeCaching: [
      {
        urlPattern: /\/api\/(schedules\/coordinator|teachers|classrooms)(\/|$|\?)/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api-cache-v1',
          networkTimeoutSeconds: 4,
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 86400
          },
          cacheableResponse: {
            statuses: [0, 200]
          }
        }
      }
    ]
  }
};

export default defineConfig({
  plugins: [
    vue(),
    VitePWA(pwaOptions)
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  },
  test: {
    environment: 'jsdom',
    testTimeout: 15000
  }
});
