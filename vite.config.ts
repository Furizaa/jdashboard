import { defineConfig, loadEnv } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { readServerEnv } from './src/server/runtime/server-env'

export default defineConfig(({ mode }) => {
  // Load .env into process.env so readServerEnv() can validate at boot.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  // `.env` is the canonical config source, but Vite's loadEnv lets a value
  // already in process.env win over the file. That let a stale shell-exported
  // GITLAB_TOKEN shadow the rotated one in .env, so the app authenticated with
  // a dead token. Re-apply the file on top so .env always wins.
  try {
    Object.assign(process.env, parseEnv(readFileSync(resolve(process.cwd(), '.env'), 'utf8')))
  } catch {
    // No .env file (e.g. CI): fall back to the real environment.
  }
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
