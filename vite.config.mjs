import { fileURLToPath } from 'url'

import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

import tailwindConfig from './tailwind.config.mjs'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))

// One project, one .env at the root: the Express server and this build read
// the same file. `.mjs` so the config stays ESM while the server stays CommonJS.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, here('.'), '')
  const apiTarget = env.DEV_API_TARGET || `http://localhost:${env.PORT || 5000}`

  return {
    root: here('./client'),
    envDir: here('.'),
    plugins: [react()],

    // PostCSS lives here rather than in postcss.config.js so that importing the
    // Tailwind config makes it a Vite config dependency. Vite then restarts the
    // dev server when it changes; a standalone postcss.config.js does not, which
    // used to leave the running server serving stale CSS.
    css: {
      postcss: {
        plugins: [tailwindcss(tailwindConfig), autoprefixer()],
      },
    },

    server: {
      port: Number(env.WEB_DEV_PORT) || 5173,
      // Lets the dashboard call a relative /api in development too, so the
      // browser only ever talks to one origin.
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
      },
    },

    build: {
      outDir: here('./dist'),
      emptyOutDir: true,
    },
  }
})
