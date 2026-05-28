import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const args = process.argv.slice(2)
const hostIndex = args.indexOf('--host')
const portIndex = args.indexOf('--port')

const host = hostIndex >= 0 ? args[hostIndex + 1] : process.env.HOST || '127.0.0.1'
const port = portIndex >= 0 ? Number(args[portIndex + 1]) : Number(process.env.PORT || 3000)
const root = process.cwd()
const distDir = path.resolve(root, 'dist')
const indexHtmlPath = path.join(distDir, 'index.html')

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

async function fileExists(filePath) {
  try {
    const fileStat = await stat(filePath)
    return fileStat.isFile()
  } catch {
    return false
  }
}

async function readStaticFile(filePath) {
  const data = await readFile(filePath)
  const contentType = mimeTypes.get(path.extname(filePath).toLowerCase()) ?? 'application/octet-stream'
  return { data, contentType }
}

if (!(await fileExists(indexHtmlPath))) {
  console.error('Missing frontend build output in dist/.')
  console.error('Run `npm run build` first, then start the app again.')
  process.exit(1)
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`)
    let pathname = decodeURIComponent(url.pathname)

    if (pathname === '/' || pathname === '/index.html') {
      const { data, contentType } = await readStaticFile(indexHtmlPath)
      res.statusCode = 200
      res.setHeader('Content-Type', contentType)
      res.end(data)
      return
    }

    const relativePath = pathname.replace(/^\//, '')
    const filePath = path.resolve(distDir, relativePath)
    const distPrefix = `${distDir}${path.sep}`

    if (!filePath.startsWith(distPrefix) && filePath !== distDir) {
      res.statusCode = 403
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end('Forbidden')
      return
    }

    if (await fileExists(filePath)) {
      const { data, contentType } = await readStaticFile(filePath)
      res.statusCode = 200
      res.setHeader('Content-Type', contentType)
      res.end(data)
      return
    }

    const { data, contentType } = await readStaticFile(indexHtmlPath)
    res.statusCode = 200
    res.setHeader('Content-Type', contentType)
    res.end(data)
  } catch (error) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end(error instanceof Error ? error.stack ?? error.message : String(error))
  }
})

server.on('error', (error) => {
  console.error(error)
  process.exit(1)
})

server.listen(port, host, () => {
  console.log(`  ➜  Local:   http://${host}:${port}/`)
})

const shutdown = () => {
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
