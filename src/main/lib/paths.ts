// PlayPix main — filesystem discovery: scan roots, ignore rules, supported formats
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

export const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.wav',
  '.wave',
  '.flac',
  '.aac',
  '.m4a',
  '.m4b',
  '.ogg',
  '.oga',
  '.opus',
  '.wma',
  '.aiff',
  '.aif'
])

export const MIN_FILE_SIZE = 16 * 1024 // skip stubs/junk files

const DIR_IGNORE = new Set([
  'windows',
  'program files',
  'program files (x86)',
  'programdata',
  'appdata',
  '$recycle.bin',
  'recycler',
  'system volume information',
  '$windows.~ws',
  '$windows.~bt',
  'windows.old',
  'recovery',
  'msocache',
  'perflogs',
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '.cache',
  '.npm',
  '.vscode',
  '.idea',
  '__pycache__',
  'venv',
  '.venv',
  'onedrivetemp',
  'application data',
  'local settings',
  'playpix'
])

export function shouldIgnoreDir(name: string): boolean {
  const n = name.toLowerCase()
  if (n.startsWith('.')) return true
  return DIR_IGNORE.has(n)
}

/** Roots scanned on first launch. Overridable via PLAYPIX_SCAN_ROOTS ('|'-separated). */
export function getScanRoots(): string[] {
  const envRoots = process.env.PLAYPIX_SCAN_ROOTS
  if (envRoots) {
    return envRoots
      .split('|')
      .map((r) => r.trim())
      .filter((r) => r.length > 0)
  }
  const roots = new Set<string>()
  if (process.platform === 'win32') {
    for (let i = 65; i <= 90; i++) {
      const drive = `${String.fromCharCode(i)}:\\`
      try {
        // Probe presence; skip inaccessible drives
        fs.statSync(drive)
        roots.add(drive)
      } catch {
        /* drive not present */
      }
    }
  } else {
    roots.add(os.homedir())
  }
  // Always include the user profile
  roots.add(os.homedir())
  return [...roots]
}

export function mimeByExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.mp3':
      return 'audio/mpeg'
    case '.wav':
    case '.wave':
      return 'audio/wav'
    case '.flac':
      return 'audio/flac'
    case '.aac':
      return 'audio/aac'
    case '.m4a':
    case '.m4b':
      return 'audio/mp4'
    case '.ogg':
    case '.oga':
    case '.opus':
      return 'audio/ogg'
    case '.wma':
      return 'audio/x-ms-wma'
    case '.aiff':
    case '.aif':
      return 'audio/aiff'
    default:
      return 'application/octet-stream'
  }
}

export function imageMimeByExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.avif':
      return 'image/avif'
    default:
      return 'image/jpeg'
  }
}
