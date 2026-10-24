import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { cloudflare } from "@cloudflare/vite-plugin";

// Vercel sets VERCEL=1 during its builds. The Cloudflare plugin would emit a
// wrangler.json (with absolute local paths) into dist/, which Vercel would then
// serve publicly, so build a plain static bundle there instead.
const isVercel = !!process.env.VERCEL

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(isVercel ? [] : [cloudflare()])],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'vendor', test: /node_modules/ }],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
