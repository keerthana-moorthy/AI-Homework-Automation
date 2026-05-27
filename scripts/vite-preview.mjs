import { preview } from 'vite'

const args = process.argv.slice(2)
const hostIndex = args.indexOf('--host')
const portIndex = args.indexOf('--port')

const host = hostIndex >= 0 ? args[hostIndex + 1] : process.env.HOST || '127.0.0.1'
const port = portIndex >= 0 ? Number(args[portIndex + 1]) : Number(process.env.PORT || 4173)

const server = await preview({
  configFile: false,
  root: process.cwd(),
  host,
  port,
})

server.printUrls()
