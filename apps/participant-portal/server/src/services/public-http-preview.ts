import type { LookupAddress } from 'node:dns'
import type { IncomingMessage } from 'node:http'
import { httpError } from '@tx-bootstrap/core/server/http/errors.js'
import { config } from '../config/index.js'
import {
  isAllowedPrivateHttpHost,
  isForbiddenIpAddress,
  requestSafeHttpResponse,
  selectSafeHttpAddress,
} from './safe-http-request.js'

const MAX_PREVIEW_BYTES = 256 * 1024

export type HttpPreview = {
  status: number
  contentType: string
  body: string
  truncated: boolean
}

export async function fetchPublicHttpPreview(target: URL, authorization?: string): Promise<HttpPreview> {
  if (target.username || target.password) {
    throw httpError(422, 'Transfer endpoints with embedded credentials cannot be previewed')
  }
  const timeoutSignal = AbortSignal.timeout(config.upstreamRequestTimeoutMs)

  try {
    const response = await requestAllowedHttpResponse(target, authorization, timeoutSignal)
    const preview = await readPreview(response)
    const contentType = response.headers['content-type']
    return {
      status: response.statusCode ?? 502,
      contentType: (Array.isArray(contentType) ? contentType[0] : contentType) || 'text/plain',
      ...preview,
    }
  } catch (error) {
    throwTransferRequestError(error, timeoutSignal)
  }
}

export async function fetchPublicHttpDownload(target: URL, authorization?: string): Promise<IncomingMessage> {
  if (target.username || target.password) {
    throw httpError(422, 'Transfer endpoints with embedded credentials cannot be downloaded')
  }
  const timeoutSignal = AbortSignal.timeout(config.transferPreview.downloadTimeoutMs)

  try {
    return await requestAllowedHttpResponse(target, authorization, timeoutSignal)
  } catch (error) {
    throwTransferRequestError(error, timeoutSignal)
  }
}

export function selectPreviewAddress(addresses: readonly LookupAddress[], allowPrivate = false): LookupAddress {
  return selectSafeHttpAddress(addresses, allowPrivate)
}

export function isAllowedPrivatePreviewHost(hostname: string, allowedHosts: readonly string[]): boolean {
  return isAllowedPrivateHttpHost(hostname, allowedHosts)
}

export { isForbiddenIpAddress }

async function requestAllowedHttpResponse(
  target: URL,
  authorization: string | undefined,
  signal: AbortSignal,
): Promise<IncomingMessage> {
  return requestSafeHttpResponse(target, {
    headers: {
      accept: '*/*',
      ...(authorization ? { authorization } : {}),
    },
    signal,
    allowedPrivateHosts: config.transferPreview.allowedPrivateHosts,
  })
}

async function readPreview(response: IncomingMessage): Promise<{ body: string; truncated: boolean }> {
  const decoder = new TextDecoder()
  let body = ''
  let bytes = 0

  for await (const chunk of response) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    const remaining = MAX_PREVIEW_BYTES - bytes
    if (value.byteLength > remaining) {
      body += decoder.decode(value.subarray(0, Math.max(remaining, 0)), { stream: true })
      response.destroy()
      return { body: body + decoder.decode(), truncated: true }
    }
    bytes += value.byteLength
    body += decoder.decode(value, { stream: true })
  }

  return { body: body + decoder.decode(), truncated: false }
}

function isHttpError(error: unknown): error is { status: number } {
  return typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
}

function throwTransferRequestError(error: unknown, timeoutSignal: AbortSignal): never {
  if (timeoutSignal.aborted) throw httpError(504, 'Transfer data endpoint request timed out')
  if (isHttpError(error)) throw error
  throw httpError(502, 'Transfer data endpoint request failed')
}
