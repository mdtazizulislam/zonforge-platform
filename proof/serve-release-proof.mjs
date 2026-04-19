import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = path.resolve('landing');
const port = Number(process.env.PORT || 4175);

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
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const appShellRoutes = new Set(['/login', '/signup', '/invite/accept', '/onboarding']);

function getContentType(filePath) {
  return contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);

    let filePath = path.join(rootDir, pathname.replace(/^\//, ''));

    if (pathname.startsWith('/app/assets/')) {
      if (await exists(filePath)) {
        const data = await fs.readFile(filePath);
        res.writeHead(200, { 'Content-Type': getContentType(filePath) });
        res.end(data);
        return;
      }
    }

    if (await exists(filePath)) {
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
      if (await exists(filePath)) {
        const data = await fs.readFile(filePath);
        res.writeHead(200, { 'Content-Type': getContentType(filePath) });
        res.end(data);
        return;
      }
    }

    if (pathname === '/app' || pathname.startsWith('/app/') || appShellRoutes.has(pathname)) {
      const appIndex = path.join(rootDir, 'app', 'index.html');
      const data = await fs.readFile(appIndex);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
      return;
    }

    const publicIndex = path.join(rootDir, 'index.html');
    const data = await fs.readFile(publicIndex);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(String(error));
  }
});

server.listen(port, () => {
  console.log(`release-proof-server http://localhost:${port}`);
});
