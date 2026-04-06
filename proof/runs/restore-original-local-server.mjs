import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, '..', '..')
const appRoot = path.join(workspaceRoot, 'landing', 'app')
const port = Number(process.env.PORT || 4173)

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase()
  res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' })
  fs.createReadStream(filePath).pipe(res)
}

async function serveStatic(res, pathname) {
  const relativePath = pathname.replace(/^\/app\//, '')
  const filePath = path.join(appRoot, relativePath)
  const resolved = path.resolve(filePath)

  if (!resolved.startsWith(path.resolve(appRoot))) {
    res.writeHead(403)
    res.end('Forbidden')
    return true
  }

  try {
    const fileStat = await stat(resolved)
    if (fileStat.isFile()) {
      sendFile(res, resolved)
      return true
    }
  } catch {
    return false
  }

  return false
}

function proxyApi(req, res, pathname, search) {
  const targetPath = `${pathname.replace(/^\/api/, '')}${search}`
  const proxyReq = https.request({
    hostname: 'api.zonforge.com',
    port: 443,
    path: targetPath,
    method: req.method,
    headers: {
      ...req.headers,
      host: 'api.zonforge.com',
    },
  }, proxyRes => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
    proxyRes.pipe(res)
  })

  proxyReq.on('error', error => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(`API proxy error: ${error.message}`)
  })

  req.pipe(proxyReq)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)
  const { pathname, search } = url

  if (pathname.startsWith('/api/')) {
    proxyApi(req, res, pathname, search)
    return
  }

  if (pathname === '/app' || pathname === '/app/') {
    sendFile(res, path.join(appRoot, 'index.html'))
    return
  }

  if (pathname.startsWith('/app/')) {
    if (await serveStatic(res, pathname)) {
      return
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Method Not Allowed')
    return
  }

  sendFile(res, path.join(appRoot, 'index.html'))
})

server.listen(port, '127.0.0.1', () => {
  console.log(`restore-original-proof server listening on http://127.0.0.1:${port}`)
})
