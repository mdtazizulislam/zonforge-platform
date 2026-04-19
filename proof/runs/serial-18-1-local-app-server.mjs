import fs from 'node:fs'
import { stat } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, '..', '..')
const landingRoot = path.join(workspaceRoot, 'landing')
const appRoot = path.join(landingRoot, 'app')
const host = '127.0.0.1'
const port = Number(process.env.PORT || 4175)
const apiHost = process.env.SERIAL181_API_HOST || '127.0.0.1'
const apiPort = Number(process.env.SERIAL181_API_PORT || 3000)

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
  '.txt': 'text/plain; charset=utf-8',
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase()
  res.writeHead(200, {
    'Content-Type': contentTypes[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  })
  fs.createReadStream(filePath).pipe(res)
}

async function serveStatic(res, rootPath, pathname, stripPrefix = '') {
  const relativePath = stripPrefix ? pathname.replace(stripPrefix, '') : pathname.replace(/^\//, '')
  const filePath = path.join(rootPath, relativePath)
  const resolved = path.resolve(filePath)

  if (!resolved.startsWith(path.resolve(rootPath))) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Forbidden')
    return true
  }

  try {
    const fileStat = await stat(resolved)
    if (fileStat.isFile()) {
      sendFile(res, resolved)
      return true
    }

    if (fileStat.isDirectory()) {
      const indexPath = path.join(resolved, 'index.html')
      sendFile(res, indexPath)
      return true
    }
  } catch {
    return false
  }

  return false
}

function proxyApi(req, res, pathname, search) {
  const proxyReq = http.request({
    hostname: apiHost,
    port: apiPort,
    path: `${pathname.replace(/^\/api/, '')}${search}`,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${apiHost}:${apiPort}`,
    },
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
    proxyRes.pipe(res)
  })

  proxyReq.on('error', (error) => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(`API proxy error: ${error.message}`)
  })

  req.pipe(proxyReq)
}

function shouldServeAppIndex(pathname) {
  return pathname === '/'
    || pathname === '/login'
    || pathname === '/signup'
    || pathname === '/onboarding'
    || pathname.startsWith('/onboarding/')
    || pathname === '/dashboard'
    || pathname.startsWith('/dashboard/')
    || pathname === '/customer'
    || pathname.startsWith('/customer')
    || pathname === '/billing'
    || pathname.startsWith('/billing/')
    || pathname === '/alerts'
    || pathname.startsWith('/alerts/')
    || pathname === '/risk'
    || pathname.startsWith('/risk/')
    || pathname === '/events'
    || pathname.startsWith('/events/')
    || pathname === '/connectors'
    || pathname.startsWith('/connectors/')
    || pathname === '/settings'
    || pathname.startsWith('/settings/')
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`)
  const { pathname, search } = url

  if (pathname.startsWith('/api/')) {
    proxyApi(req, res, pathname, search)
    return
  }

  if (pathname.startsWith('/app/')) {
    if (await serveStatic(res, landingRoot, pathname, '/')) {
      return
    }
  }

  if (await serveStatic(res, landingRoot, pathname, '/')) {
    return
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Method Not Allowed')
    return
  }

  if (shouldServeAppIndex(pathname)) {
    sendFile(res, path.join(appRoot, 'index.html'))
    return
  }

  sendFile(res, path.join(landingRoot, 'index.html'))
})

server.listen(port, host, () => {
  console.log(`serial-18.1 local app server listening on http://${host}:${port}`)
})