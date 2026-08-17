import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'

// Grab the short commit hash at build time. On Vercel we get it from
// VERCEL_GIT_COMMIT_SHA (Vercel builds from a source archive, not a full
// git clone, so `git rev-parse` fails there). Falls back to local git for
// dev / non-Vercel builds; falls back to 'unknown' if both fail.
function gitShortHash(): string {
  const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA
  if (vercelSha) return vercelSha.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
  } catch {
    return 'unknown'
  }
}

// ISO-ish local build stamp — enough to answer "did my latest deploy land?"
// at a glance without needing to squint at a full timestamp.
function buildStamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_COMMIT__: JSON.stringify(gitShortHash()),
    __BUILD_TIME__: JSON.stringify(buildStamp()),
  },
})
