import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import type { Plugin } from 'vite'

// ─── Dev-server plugin: write/read scene files directly to project/scenes/ ───

const SCENES_DIR = path.resolve(__dirname, 'scenes')

function sceneFilePlugin(): Plugin {
  return {
    name: 'scene-file-server',
    configureServer(server) {
      // POST /api/save-scene  body: { filename, data }
      server.middlewares.use('/api/save-scene', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }
        let body = ''
        req.on('data', (chunk: Buffer) => { body += chunk.toString() })
        req.on('end', () => {
          try {
            const { filename, data } = JSON.parse(body) as { filename: string; data: unknown }
            if (!filename || typeof filename !== 'string') throw new Error('filename required')
            // Sanitize: allow only basename, no path traversal
            const safe = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_')
            const dest = path.join(SCENES_DIR, safe.endsWith('.json') ? safe : safe + '.json')
            fs.mkdirSync(SCENES_DIR, { recursive: true })
            fs.writeFileSync(dest, JSON.stringify(data, null, 2), 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, path: dest }))
          } catch (e) {
            res.statusCode = 400
            res.end(JSON.stringify({ ok: false, error: String(e) }))
          }
        })
      })

      // GET /api/list-scenes  → { files: string[] }
      server.middlewares.use('/api/list-scenes', (_req, res) => {
        try {
          fs.mkdirSync(SCENES_DIR, { recursive: true })
          const files = fs.readdirSync(SCENES_DIR).filter(f => f.endsWith('.json'))
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ files }))
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ files: [], error: String(e) }))
        }
      })

      // GET /api/load-scene?file=name.json  → raw JSON
      server.middlewares.use('/api/load-scene', (req, res) => {
        try {
          const url = new URL(req.url ?? '', 'http://localhost')
          const file = url.searchParams.get('file')
          if (!file) throw new Error('file param required')
          const safe = path.basename(file)
          const src = path.join(SCENES_DIR, safe)
          if (!fs.existsSync(src)) { res.statusCode = 404; res.end('Not found'); return }
          const content = fs.readFileSync(src, 'utf-8')
          res.setHeader('Content-Type', 'application/json')
          res.end(content)
        } catch (e) {
          res.statusCode = 400
          res.end(String(e))
        }
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), sceneFilePlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['vcad-engine', 'manifold-3d']
  },
  build: {
    target: 'esnext'
  },
  server: {
    port: 5176,
    fs: {
      allow: ['..']
    }
  }
})
