import { createReadStream, existsSync } from 'node:fs'
import { extname, isAbsolute, relative, resolve } from 'node:path'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { config } from '../config/index.js'
import { isOnboarded } from './onboarding-service.js'

export async function serveStaticApp(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
  const rootDir = (await isOnboarded()) ? config.portalStaticDir : config.staticDir
  return sendStaticFile(reply, resolveStaticPath(rootDir, request.url))
}

export async function sendStaticFile(reply: FastifyReply, filePath: string): Promise<FastifyReply> {
  reply.code(200)
  reply.headers({
    'Content-Type': contentType(filePath),
    'Cache-Control': filePath.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable',
  })
  return reply.send(createReadStream(filePath))
}

function resolveStaticPath(rootDir: string, originalUrl: string): string {
  const root = resolve(rootDir)
  const pathname = decodeURIComponent(new URL(originalUrl, 'http://localhost').pathname)
  const hasExtension = Boolean(extname(pathname))
  const relativePath = hasExtension ? pathname.replace(/^\/+/, '') : 'index.html'
  const filePath = resolve(root, relativePath)

  if (!isPathInside(root, filePath) || !existsSync(filePath)) {
    return resolve(root, 'index.html')
  }
  return filePath
}

function isPathInside(root: string, filePath: string): boolean {
  const child = relative(root, filePath)
  return child === '' || (!child.startsWith('..') && !isAbsolute(child))
}

function contentType(filePath: string): string {
  switch (extname(filePath)) {
    case '.css':
      return 'text/css; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.ico':
      return 'image/x-icon'
    default:
      return 'text/html; charset=utf-8'
  }
}
