// PlayPix main — custom protocols:
//   stream://  → media streaming with HTTP range support (seekable audio)
//   art://     → cached artwork images
import { protocol } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { Readable } from 'stream'
import { mimeByExt, imageMimeByExt } from './lib/paths'
import { artPath, imageContentType } from './services/artwork'

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp'])

function mimeForPath(p: string): string {
  const ext = path.extname(p).toLowerCase()
  if (IMAGE_EXTS.has(ext)) return imageMimeByExt(ext)
  return mimeByExt(ext)
}

export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'stream', privileges: { stream: true, supportFetchAPI: true, corsEnabled: true } },
    { scheme: 'art', privileges: { stream: true, supportFetchAPI: true, corsEnabled: true } }
  ])
}

function toWeb(nodeStream: fs.ReadStream): ReadableStream {
  return Readable.toWeb(nodeStream) as unknown as ReadableStream
}

function mediaResponse(p: string, req: Request): Response {
  let stat: fs.Stats
  try {
    stat = fs.statSync(p)
  } catch {
    return new Response(null, { status: 404 })
  }
  const size = stat.size
  const type = mimeForPath(p)
  const rangeHeader = req.headers.get('range') || ''

  if (rangeHeader && /bytes=\d*-\d*/.test(rangeHeader)) {
    const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader)
    let start = m && m[1] ? parseInt(m[1], 10) : 0
    let end = m && m[2] ? parseInt(m[2], 10) : size - 1
    if (isNaN(start) || start < 0) start = 0
    if (isNaN(end) || end >= size) end = size - 1
    if (start > end || start >= size) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}`, 'Access-Control-Allow-Origin': '*' }
      })
    }
    return new Response(toWeb(fs.createReadStream(p, { start, end })), {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }

  return new Response(toWeb(fs.createReadStream(p)), {
    status: 200,
    headers: {
      'Content-Type': type,
      'Content-Length': String(size),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    }
  })
}

export function registerProtocolHandlers(): void {
  protocol.handle('stream', (req) => {
    try {
      const u = new URL(req.url)
      const p = u.searchParams.get('p')
      if (!p) return new Response(null, { status: 400 })
      return mediaResponse(p, req)
    } catch {
      return new Response(null, { status: 500 })
    }
  })

  protocol.handle('art', (req) => {
    try {
      const u = new URL(req.url)
      const key = decodeURIComponent(u.pathname).replace(/^\/+/, '')
      if (!key || key.includes('..')) return new Response(null, { status: 404 })
      const p = artPath(key)
      if (!fs.existsSync(p)) return new Response(null, { status: 404 })
      const data = fs.readFileSync(p)
      return new Response(new Uint8Array(data), {
        status: 200,
        headers: {
          'Content-Type': imageContentType(key),
          'Content-Length': String(data.length),
          'Cache-Control': 'max-age=86400',
          'Access-Control-Allow-Origin': '*'
        }
      })
    } catch {
      return new Response(null, { status: 500 })
    }
  })
}
