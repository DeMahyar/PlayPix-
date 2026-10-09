import { BrowserWindow, ipcMain, app, screen } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { logMain } from './index'

let mainWindow: BrowserWindow | null = null
let miniWindow: BrowserWindow | null = null
let savedMiniBounds: { x: number; y: number } | null = null

function getAppIcon(): string | undefined {
  const ico = path.join(__dirname, '../../build/icon.ico')
  const png = path.join(__dirname, '../../build/icon.png')
  if (fs.existsSync(ico)) return ico
  if (fs.existsSync(png)) return png
  return undefined
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function getMiniWindow(): BrowserWindow | null {
  return miniWindow
}

export function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow

  logMain('createMainWindow: initializing BrowserWindow')
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 920,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: '#070b14',
    title: 'PlayPix',
    icon: getAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })

  mainWindow.setMenuBarVisibility(false)

  mainWindow.webContents.on('did-finish-load', () => {
    logMain('mainWindow: did-finish-load')
  })
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    logMain(`mainWindow: did-fail-load code=${code} desc=${desc} url=${url}`)
  })
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    logMain(`mainWindow: render-process-gone: ${JSON.stringify(details)}`)
  })
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    logMain(`renderer console [lvl ${level}] ${message} (${sourceId}:${line})`)
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    logMain(`mainWindow: loading dev URL ${devUrl}`)
    void mainWindow.loadURL(devUrl)
  } else {
    const htmlPath = path.join(__dirname, '../renderer/index.html')
    logMain(`mainWindow: loading file ${htmlPath}`)
    void mainWindow.loadFile(htmlPath)
  }

  mainWindow.once('ready-to-show', () => {
    logMain('mainWindow: ready-to-show fired')
    mainWindow?.show()
    if (process.env.PLAYPIX_E2E) mainWindow?.maximize()
  })

  // Safety fallback: ensure window is visible even if ready-to-show is delayed
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      logMain('mainWindow: timeout fallback -> force showing window')
      mainWindow.show()
    }
  }, 1500)

  const sendMaximized = (): void => {
    mainWindow?.webContents.send('win:maximized', mainWindow?.isMaximized() ?? false)
  }
  mainWindow.on('maximize', sendMaximized)
  mainWindow.on('unmaximize', sendMaximized)
  mainWindow.on('closed', () => {
    logMain('mainWindow: closed event fired')
    mainWindow = null
    // If main window closes, close mini window as well
    if (miniWindow && !miniWindow.isDestroyed()) {
      try {
        miniWindow.close()
      } catch {
        /* ignore */
      }
    }
  })

  return mainWindow
}

export function createMiniWindow(): BrowserWindow {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.show()
    miniWindow.focus()
    return miniWindow
  }

  const primaryDisplay = screen.getPrimaryDisplay()
  const workArea = primaryDisplay.workArea

  const defaultX = Math.round(workArea.x + workArea.width - 295)
  const defaultY = Math.round(workArea.y + workArea.height - 295)

  const x = savedMiniBounds?.x ?? defaultX
  const y = savedMiniBounds?.y ?? defaultY

  miniWindow = new BrowserWindow({
    width: 270,
    height: 270,
    x,
    y,
    minWidth: 250,
    maxWidth: 300,
    minHeight: 250,
    maxHeight: 300,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: false,
    maximizable: false,
    skipTaskbar: false,
    hasShadow: true,
    title: 'PlayPix Mini Player',
    icon: getAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })

  miniWindow.setMenuBarVisibility(false)

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void miniWindow.loadURL(`${devUrl}#mini`)
  } else {
    void miniWindow.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: 'mini' })
  }

  miniWindow.once('ready-to-show', () => {
    miniWindow?.show()
    miniWindow?.focus()
  })

  miniWindow.on('moved', () => {
    if (miniWindow && !miniWindow.isDestroyed()) {
      const pos = miniWindow.getPosition()
      savedMiniBounds = { x: pos[0], y: pos[1] }
    }
  })

  miniWindow.on('closed', () => {
    miniWindow = null
  })

  return miniWindow
}

export function openMiniPlayer(): void {
  createMiniWindow()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize()
  }
}

export function closeMiniPlayer(): void {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.close()
    miniWindow = null
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
}

export function minimizeMiniPlayer(): void {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.minimize()
  }
}

export function toggleMiniAlwaysOnTop(): boolean {
  if (!miniWindow || miniWindow.isDestroyed()) return false
  const current = miniWindow.isAlwaysOnTop()
  miniWindow.setAlwaysOnTop(!current)
  return !current
}

export function registerWindowIpc(): void {
  ipcMain.on('win:minimize', () => mainWindow?.minimize())
  ipcMain.on('win:maximize', () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.on('win:close', () => mainWindow?.close())
  ipcMain.handle('win:isMaximized', () => mainWindow?.isMaximized() ?? false)

  // Mini player window controls
  ipcMain.on('win:openMiniPlayer', () => openMiniPlayer())
  ipcMain.on('win:closeMiniPlayer', () => closeMiniPlayer())
  ipcMain.on('win:minimizeMiniPlayer', () => minimizeMiniPlayer())
  ipcMain.handle('win:isMiniPlayerOpen', () => !!miniWindow && !miniWindow.isDestroyed())
  ipcMain.handle('win:toggleMiniAlwaysOnTop', () => toggleMiniAlwaysOnTop())
}

export function flushWindow(): void {
  if (miniWindow && !miniWindow.isDestroyed()) {
    try {
      miniWindow.close()
    } catch {
      /* ignore */
    }
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.close()
    } catch {
      /* ignore */
    }
  }
}

export function appVersion(): string {
  return app.getVersion()
}
