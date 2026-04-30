import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // injectManifest: usa src/sw.js como base e injeta o manifesto de precache.
      // Isso permite adicionar handlers customizados (push, notificationclick)
      // que não são possíveis com a estratégia generateSW.
      strategies:   'injectManifest',
      srcDir:       'src',
      filename:     'sw.js',
      registerType: 'autoUpdate',

      injectManifest: {
        // Garante que __WB_MANIFEST é substituído corretamente
        injectionPoint: '__WB_MANIFEST',
        // Inclui todos os assets estáticos no precache
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
      },

      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],

      manifest: {
        name:             'Ellos Juventude',
        short_name:       'Ellos',
        description:      'Sistema de gestão do departamento de jovens',
        theme_color:      '#0F2A4A',
        background_color: '#0F2A4A',
        display:          'standalone',
        orientation:      'portrait',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': '/src' },
  },
})
