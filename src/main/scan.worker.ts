// PlayPix main — metadata parsing worker (music-metadata is bundled here).
// Receives { id, paths[] }, replies { id, results[] }.
import { parentPort } from 'worker_threads'
import * as mmImport from 'music-metadata'
import type { ParseResult } from './services/metadata'

interface MMModule {
  parseFile: (p: string, opts?: { duration?: boolean }) => Promise<{
    common: {
      title?: string | null
      artist?: string | null
      album?: string | null
      albumartist?: string | null
      genre?: string[]
      track?: { no?: number | null }
      disk?: { no?: number | null }
      year?: number | null
      picture?: { format?: string; data: Uint8Array }[]
    }
    format: {
      duration?: number | null
      bitrate?: number | null
      sampleRate?: number | null
    }
  }>
}
const mm = mmImport as unknown as MMModule

function extFromMime(mime: string | undefined): string {
  if (!mime) return 'jpg'
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('gif')) return 'gif'
  return 'jpg'
}

async function parseOne(p: string): Promise<ParseResult> {
  try {
    const meta = await mm.parseFile(p, { duration: true })
    const c = meta.common
    const f = meta.format
    const pic = c.picture && c.picture.length ? c.picture[0] : undefined
    return {
      path: p,
      ok: true,
      data: {
        path: p,
        title: c.title ?? '',
        artist: c.artist ?? '',
        album: c.album ?? '',
        albumArtist: c.albumartist ?? '',
        genre: (c.genre ?? []).join(', '),
        trackNo: c.track?.no ?? null,
        discNo: c.disk?.no ?? null,
        year: c.year ?? null,
        duration: f.duration ?? 0,
        bitrate: f.bitrate ?? null,
        sampleRate: f.sampleRate ?? null,
        picture: pic ? { ext: extFromMime(pic.format), data: Buffer.from(pic.data) } : null
      }
    }
  } catch (e: unknown) {
    return { path: p, ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

if (parentPort) {
  parentPort.on('message', async (msg: { id: number; paths: string[] }) => {
    const results: ParseResult[] = []
    for (const p of msg.paths || []) {
      results.push(await parseOne(p))
    }
    parentPort!.postMessage({ id: msg.id, results })
  })
}
