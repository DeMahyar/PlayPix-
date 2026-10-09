// PlayPix main — safe metadata write-back to audio files.
// Strategy: validate → backup original bytes → write tags → re-parse to verify →
// restore backup on any failure. The user's original file is never corrupted.
import * as fs from 'fs'
import * as path from 'path'
import * as fsp from 'fs/promises'
import { app } from 'electron'
import type { MetadataEdit } from '../../shared/types'

export interface TagWriteResult {
  ok: boolean
  warning?: string
}

interface TagPicture {
  data: Buffer
  mimeType?: string
  description?: string
}

interface TagLibTag {
  title?: string
  artist?: string
  album?: string
  albumArtist?: string
  genre?: string
  year?: number
  pictures?: unknown[]
}

interface TagLibFile {
  tag: TagLibTag
  save: () => void
}

// Optional rich writer: node-taglib-sharp supports MP3/FLAC/M4A/OGG/WMA/WAV.
// If it is unavailable at runtime, edits remain in the PlayPix database and the
// user is told honestly that in-file tags were left untouched.
let taglib: {
  File: { createFromPath: (p: string) => TagLibFile }
  Picture?: { fromPath: (p: string) => unknown; fromData: (b: Buffer) => unknown }
} | null = null
let taglibTried = false

async function getTaglib(): Promise<typeof taglib> {
  if (taglibTried) return taglib
  taglibTried = true
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = (await import(/* webpackIgnore: true */ 'node-taglib-sharp')) as any
    if (mod?.File?.createFromPath) {
      taglib = { File: mod.File, Picture: mod.Picture }
    }
  } catch {
    taglib = null
  }
  return taglib
}

function backupPath(original: string): string {
  const dir = path.join(app.getPath('userData'), 'backups')
  fs.mkdirSync(dir, { recursive: true })
  const stamp = Date.now().toString(36)
  return path.join(dir, `${path.basename(original)}.${stamp}.bak`)
}

function mimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    default:
      return 'image/jpeg'
  }
}

function pruneBackups(dir: string, keep: number): void {
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.bak'))
      .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
    for (const x of files.slice(keep)) {
      try {
        fs.unlinkSync(path.join(dir, x.f))
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * Write supported metadata back to the audio file.
 * The DB is always updated by the caller regardless of the outcome here;
 * on any failure the original file is restored from the backup.
 */
export async function writeTagsSafely(
  filePath: string,
  fields: MetadataEdit,
  artPathFile?: string
): Promise<TagWriteResult> {
  const lib = await getTaglib()
  if (!lib) {
    return {
      ok: true,
      warning: 'Saved to your PlayPix library. In-file tags are kept unchanged for this format.'
    }
  }
  let backup: string | null = null
  try {
    const st = await fsp.stat(filePath)
    if (!st.isFile()) throw new Error('not a file')
    backup = backupPath(filePath)
    await fsp.copyFile(filePath, backup)

    const f = lib.File.createFromPath(filePath)
    if (fields.title !== undefined) f.tag.title = fields.title.trim().slice(0, 300)
    if (fields.artist !== undefined) f.tag.artist = fields.artist.trim().slice(0, 300)
    if (fields.album !== undefined) f.tag.album = fields.album.trim().slice(0, 300)
    if (fields.albumArtist !== undefined) f.tag.albumArtist = fields.albumArtist.trim().slice(0, 300)
    if (fields.genre !== undefined) f.tag.genre = fields.genre.trim().slice(0, 120)
    if (fields.year !== undefined) {
      if (fields.year === null) f.tag.year = undefined
      else {
        const y = Math.floor(Number(fields.year))
        if (Number.isFinite(y) && y > 0) f.tag.year = y
      }
    }
    if (artPathFile && lib.Picture) {
      try {
        const pic = lib.Picture.fromPath(artPathFile)
        if (pic) {
          f.tag.pictures = [pic]
        }
      } catch {
        try {
          const buf = await fsp.readFile(artPathFile)
          const pic = lib.Picture.fromData(buf)
          if (pic) {
            f.tag.pictures = [pic]
          }
        } catch {
          /* ignore */
        }
      }
    }
    f.save()

    // Corruption guard: the file must still parse as audio metadata
    const mm = (await import('music-metadata')) as unknown as {
      parseFile: (p: string, o?: Record<string, unknown>) => Promise<unknown>
    }
    await mm.parseFile(filePath, { duration: false })

    pruneBackups(path.dirname(backup), 4)
    return { ok: true }
  } catch {
    if (backup) {
      try {
        await fsp.copyFile(backup, filePath)
      } catch {
        /* keep backup for manual recovery */
      }
    }
    return {
      ok: false,
      warning: 'Saved to your PlayPix library. The audio file itself was left unchanged.'
    }
  }
}
