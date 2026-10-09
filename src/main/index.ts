// PlayPix main — application entry
import { app, BrowserWindow, dialog, globalShortcut } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { registerSchemes, registerProtocolHandlers } from './protocols'
import { initDb, closeDb } from './services/db'
import { initArtwork, kickNetFetch } from './services/artwork'
import { scanner } from './services/scanner'
import * as watcher from './services/watcher'
import { createMainWindow, getMainWindow, registerWindowIpc } from './window'
import { registerIpc, notifyLibraryChanged, sendToRenderer } from './ipc'

export function logMain(msg: string): void {
  try {
    const dir = app.getPath('userData')
    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(path.join(dir, 'playpix-main.log'), `[${new Date().toISOString()}] ${msg}\n`)
  } catch {
    /* ignore */
  }
}

// Single instance
const gotLock = app.requestSingleInstanceLock()
logMain(`[startup] gotLock=${gotLock}`)
if (!gotLock) {
  logMain('[startup] requestSingleInstanceLock returned false. Quitting.')
  app.quit()
}

registerSchemes()

// Keep main-process errors from killing the app; log them for diagnosis.
// If the failure happens before any window exists, surface it in an error
// dialog as well — a completely silent "app does not open" is unacceptable.
let bootErrorShown = false
process.on('uncaughtException', (err) => {
  logMain(`uncaughtException: ${err?.stack || err}`)
  if (!bootErrorShown && BrowserWindow.getAllWindows().length === 0) {
    bootErrorShown = true
    try {
      dialog.showErrorBox('PlayPix error', String(err?.message || err))
    } catch { /* dialog unavailable before ready */ }
  }
})
process.on('unhandledRejection', (err) => {
  logMain(`unhandledRejection: ${err instanceof Error ? err.stack : String(err)}`)
  if (!bootErrorShown && app.isReady() && BrowserWindow.getAllWindows().length === 0) {
    bootErrorShown = true
    dialog.showErrorBox(
      'PlayPix failed to start',
      `${err instanceof Error ? err.message : String(err)}\n\nDetails were logged to playpix-main.log in the PlayPix settings folder.`
    )
  }
})

app.on('second-instance', () => {
  logMain('second-instance event received')
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  } else {
    createMainWindow()
  }
})

app.whenReady().then(async () => {
  if (process.env.PLAYPIX_E2E === '1') {
    // eslint-disable-next-line no-console
    console.log('[boot] whenReady')
    // Local crashpad dumps so renderer crashes can be diagnosed (no upload).
    try {
      const { crashReporter } = await import('electron')
      crashReporter.start({ uploadToServer: false, compress: false })
      // eslint-disable-next-line no-console
      console.log('[boot] crashReporter on →', app.getPath('crashDumps'))
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log('[boot] crashReporter failed:', String(err))
    }
  }
  if (process.env.PLAYPIX_USER_DATA) {
    app.setPath('userData', process.env.PLAYPIX_USER_DATA)
  }
  const userData = app.getPath('userData')
  logMain(`boot: electron=${process.versions.electron} userData=${userData}`)
  try {
    await initDb(userData)
    logMain('boot: initDb OK')
    initArtwork(userData)
    logMain('boot: initArtwork OK')
    registerProtocolHandlers()
    logMain('boot: registerProtocolHandlers OK')
    registerWindowIpc()
    logMain('boot: registerWindowIpc OK')
    registerIpc()
    logMain('boot: registerIpc OK')
    if (process.env.PLAYPIX_E2E === '1') {
      // eslint-disable-next-line no-console
      console.log('[boot] ipc registered')
    }
  } catch (err) {
    const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)
    logMain(`FATAL boot error: ${detail}`)
    // Never fail silently: always tell the user why the app cannot start.
    dialog.showErrorBox(
      'PlayPix could not start correctly',
      `A core component failed to initialize:\n\n${err instanceof Error ? err.message : String(err)}\n\nDetails were logged to:\n${path.join(userData, 'playpix-main.log')}`
    )
  }

  try {
    await scanner.init()
    logMain(`boot: scanner init OK, phase=${scanner.getProgress().phase}`)
    if (process.env.PLAYPIX_E2E === '1') {
      // eslint-disable-next-line no-console
      console.log('[boot] scanner initialized, phase=', scanner.getProgress().phase)
    }
  } catch (err) {
    logMain(`scanner init failed (UI continues): ${err instanceof Error ? err.stack : String(err)}`)
  }

  // Scanner → renderer events
  scanner.on('progress', (p) => sendToRenderer('scan:event', p))
  scanner.on('done', (p) => {
    sendToRenderer('scan:event', p)
    notifyLibraryChanged('scan')
    if (p.phase === 'done') {
      watcher.rebuild()
      // Optional internet artwork for albums without covers (silently skips offline)
      void kickNetFetch(() => notifyLibraryChanged('artwork'))
    }
  })
  scanner.on('imported-folders', (dirs: string[]) => {
    watcher.addWatchFolders(dirs)
  })

  watcher.initWatcher(() => notifyLibraryChanged('watch'))
  logMain('boot: watcher initialized')

  logMain('boot: creating main window...')
  createMainWindow()
  logMain('boot: createMainWindow returned')

  // ---------- Windows media keys (§28) ----------
  // Hardware media keys control playback globally, like any native player.
  // The renderer owns playback state, so events are forwarded over IPC.
  try {
    const wc = (): BrowserWindow | null => getMainWindow()
    const send = (key: string): void => {
      const w = wc()
      if (w && !w.isDestroyed()) w.webContents.send('mediaKey', key)
    }
    globalShortcut.register('MediaPlayPause', () => send('playpause'))
    globalShortcut.register('MediaNextTrack', () => send('next'))
    globalShortcut.register('MediaPreviousTrack', () => send('prev'))
    globalShortcut.register('MediaStop', () => send('stop'))
  } catch {
    /* globalShortcut unavailable — keyboard shortcuts in-app still work */
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })

  // Light startup check: files moved/deleted while the app was closed.
  setTimeout(() => {
    if (!scanner.isRunning()) {
      void scanner
        .validateExisting()
        .then(() => notifyLibraryChanged('watch'))
        .catch(() => {})
    }
  }, 5000)

  // End-to-end test harness (development only). PLAYPIX_E2E_DRIVER=1 boots the
  // renderer bridge without auto-running the full walkthrough (manual CDP debug).
  if (process.env.PLAYPIX_E2E === '1' && process.env.PLAYPIX_E2E_DRIVER !== '1') {
    import('./e2e')
      .then(({ runE2E }) => runE2E())
      .catch((e) => logMain(`e2e import failed: ${e}`))
  }
})

app.on('window-all-closed', () => {
  logMain('app: window-all-closed event fired -> app.quit()')
  app.quit()
})

app.on('before-quit', () => {
  logMain('app: before-quit event fired')
  try {
    globalShortcut.unregisterAll()
  } catch {
    /* ignore */
  }
  try {
    watcher.destroyWatcher()
    scanner.cancel()
    scanner.destroy()
  } catch {
    /* ignore */
  }
  closeDb()
  logMain('app: before-quit completed')
})

app.on('will-quit', () => {
  logMain('app: will-quit event fired')
})
