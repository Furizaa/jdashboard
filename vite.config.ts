import { defineConfig, loadEnv } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import { readServerEnv } from './src/server/runtime/server-env'

export default defineConfig(({ mode }) => {
  // Load .env into process.env so readServerEnv() can validate at boot.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  // Throw at config time when required Jira env vars are missing — this
  // refuses to start dev/build and prints a clear pointer to .env.example.
  readServerEnv()

  return {
    server: {
      port: 4004,
    },
    resolve: {
      alias: {
        '~': resolve(import.meta.dirname, './src'),
      },
    },
    plugins: [tailwindcss(), tanstackStart(), viteReact()],
  }
})
