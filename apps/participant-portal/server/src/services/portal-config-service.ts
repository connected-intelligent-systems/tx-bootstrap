import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { join } from 'node:path'
import type { FastifyReply } from 'fastify'
import { config } from '../config/index.js'
import { isPlainObject, isRecord, pruneUndefined } from '../lib/objects.js'
import type { JsonRecord } from '../types.js'

interface PortalConfigSandbox {
  window: { config?: unknown }
  config?: unknown
}

export async function serveSanitizedPortalConfig(reply: FastifyReply): Promise<FastifyReply> {
  const publicConfig = await loadPublicPortalConfig()
  reply.headers({
    'Content-Type': 'text/javascript; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  return reply.send('window.config = ' + JSON.stringify(publicConfig) + ';\n')
}

export async function loadPublicPortalConfig(): Promise<JsonRecord> {
  const bundledConfig = await readBundledPublicConfig()
  return sanitizePublicConfig({
    ...bundledConfig,
    title: config.publicConfig.title,
    participantPortalName: config.publicConfig.participantPortalName,
    publicEdcEndpoint: config.publicConfig.publicEdcEndpoint || bundledConfig.publicEdcEndpoint,
  })
}

async function readBundledPublicConfig(): Promise<JsonRecord> {
  try {
    const source = await readFile(join(config.staticDir, 'config.js'), 'utf8')
    return extractPublicConfig(source) ?? {}
  } catch {
    return {}
  }
}

function extractPublicConfig(source: string): JsonRecord | null {
  const sandbox: PortalConfigSandbox = { window: {}, config: undefined }
  vm.runInNewContext(source, sandbox, { timeout: 50 })
  const runtimeConfig = sandbox.window.config ?? sandbox.config
  if (!isRecord(runtimeConfig)) return null

  return sanitizePublicConfig(runtimeConfig)
}

function sanitizePublicConfig(runtimeConfig: JsonRecord): JsonRecord {
  return pruneUndefined({
    title: typeof runtimeConfig.title === 'string' ? runtimeConfig.title : undefined,
    participantPortalName:
      typeof runtimeConfig.participantPortalName === 'string' ? runtimeConfig.participantPortalName : undefined,
    publicEdcEndpoint:
      typeof runtimeConfig.publicEdcEndpoint === 'string' ? runtimeConfig.publicEdcEndpoint : undefined,
    showQuery: typeof runtimeConfig.showQuery === 'boolean' ? runtimeConfig.showQuery : undefined,
    deploymentLinks: sanitizeDeploymentLinks(runtimeConfig.deploymentLinks),
    theme: sanitizeTheme(runtimeConfig.theme),
  })
}

function sanitizeDeploymentLinks(links: unknown): JsonRecord[] | undefined {
  if (!Array.isArray(links)) return undefined
  const sanitized = links
    .map((link): JsonRecord | null =>
      isRecord(link)
        ? pruneUndefined({
            label: typeof link.label === 'string' ? link.label : undefined,
            href: typeof link.href === 'string' ? link.href : undefined,
          })
        : null,
    )
    .filter((link): link is JsonRecord => Boolean(link?.label && link.href))
  return sanitized.length ? sanitized : undefined
}

function sanitizeTheme(theme: unknown): JsonRecord | undefined {
  if (!isRecord(theme)) return undefined
  return pruneUndefined({
    light: sanitizeThemeMode(theme.light),
    dark: sanitizeThemeMode(theme.dark),
  })
}

function sanitizeThemeMode(mode: unknown): JsonRecord | undefined {
  if (!isRecord(mode)) return undefined
  return pruneUndefined({
    palette: sanitizePalette(mode.palette),
    typography: isPlainObject(mode.typography) ? mode.typography : undefined,
    spacing: typeof mode.spacing === 'number' ? mode.spacing : undefined,
    shape: isPlainObject(mode.shape) ? mode.shape : undefined,
    sidebarWidth: typeof mode.sidebarWidth === 'number' ? mode.sidebarWidth : undefined,
    logo: sanitizeLogo(mode.logo),
  })
}

function sanitizePalette(palette: unknown): JsonRecord | undefined {
  if (!isRecord(palette)) return undefined
  return pruneUndefined({
    primary: sanitizeColorGroup(palette.primary),
    secondary: sanitizeColorGroup(palette.secondary),
    background: sanitizeColorGroup(palette.background),
    text: sanitizeColorGroup(palette.text),
    error: sanitizeColorGroup(palette.error),
    warning: sanitizeColorGroup(palette.warning),
    info: sanitizeColorGroup(palette.info),
    success: sanitizeColorGroup(palette.success),
    mode: typeof palette.mode === 'string' ? palette.mode : undefined,
  })
}

function sanitizeColorGroup(group: unknown): JsonRecord | undefined {
  if (!isRecord(group)) return undefined
  return Object.fromEntries(Object.entries(group).filter(([, value]) => typeof value === 'string'))
}

function sanitizeLogo(logo: unknown): JsonRecord | undefined {
  if (!isRecord(logo)) return undefined
  return pruneUndefined({
    src: typeof logo.src === 'string' ? logo.src : undefined,
    alt: typeof logo.alt === 'string' ? logo.alt : undefined,
    sx: isPlainObject(logo.sx) ? logo.sx : undefined,
  })
}
