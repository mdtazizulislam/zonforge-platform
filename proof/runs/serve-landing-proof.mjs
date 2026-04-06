import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

const rootDir = path.resolve('landing')
const host = '127.0.0.1'
const port = Number(process.env.PORT || 4173)

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8'],
])

function resolveFallback(pathname) {
  if (pathname === '/' || pathname === '/index.html') {
    return path.join(rootDir, 'index.html')
  }

  if (pathname.startsWith('/app')) {
    return path.join(rootDir, 'app', 'index.html')
  }

  if (!path.extname(pathname)) {
    return path.join(rootDir, 'app', 'index.html')
  }

  return path.join(rootDir, 'index.html')
}

async function sendFile(filePath, response) {
  const content = await fs.readFile(filePath)
  const extension = path.extname(filePath).toLowerCase()
  response.writeHead(200, {
    'Content-Type': contentTypes.get(extension) || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  })
  response.end(content)
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${host}:${port}`)
    const pathname = decodeURIComponent(url.pathname)
    const requestedPath = path.join(rootDir, pathname.replace(/^\//, ''))

    try {
      const stat = await fs.stat(requestedPath)
      if (stat.isFile()) {
        await sendFile(requestedPath, response)
        return
      }

      if (stat.isDirectory()) {
        const indexPath = path.join(requestedPath, 'index.html')
        await sendFile(indexPath, response)
        return
      }
    } catch {
      // Fall through to SPA fallback.
    }

    await sendFile(resolveFallback(pathname), response)
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end(error instanceof Error ? error.message : 'Internal server error')
  }
})

server.listen(port, host, () => {
  console.log(`Landing proof server listening on http://${host}:${port}`)
})