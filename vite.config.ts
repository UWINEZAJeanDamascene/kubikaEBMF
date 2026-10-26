import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },

  build: {
    rollupOptions: {
      output: {
        // Group ONLY libraries that genuinely load on every page, so they can
        // be cached independently of app code.
        //
        // MUI and recharts were grouped here too, and that backfired: forcing a
        // library into one named chunk means any eagerly-imported page touching
        // even a single component (the login page uses `Button`) pulls the whole
        // chunk into the entry graph, where Vite then modulepreloads it. The
        // result was ~800 kB of MUI + recharts fetched on first paint for users
        // who never open a chart or a stock screen.
        //
        // Left ungrouped, Rollup tree-shakes and splits them per route, so the
        // heavy usage stays in the lazy route chunks where it belongs.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router', 'react-router-dom'],
          'query-vendor': ['@tanstack/react-query'],
          'form-vendor': ['react-hook-form', '@hookform/resolvers', 'zod'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
  optimizeDeps: {
    exclude: ['lucide-react', 'react-hook-form', '@hookform/resolvers/zod', 'zod'],
  },
})
