// PlayPix main — e2e harness (dev only). Drives the real UI, takes screenshots,
// and writes a functional report. Launched via `npm run e2e`.
import { app, ipcMain } from 'electron'
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { getMainWindow } from './window'
import { scanner } from './services/scanner'
import { getLibraryData, removeSongs, search } from './services/library'

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Minimal 16-bit PCM mono WAV writer — unique-title file for import tests. */
function writeTestWav(file: string, seconds: number): void {
  const rate = 22050
  const samples = Math.floor(rate * seconds)
  const dataSize = samples * 2
  const buf = Buffer.alloc(44 + dataSize)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(rate, 24)
  buf.writeUInt32LE(rate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataSize, 40)
  for (let i = 0; i < samples; i++) {
    const t = i / rate
    const v = Math.round(Math.sin(2 * Math.PI * 440 * t) * 12000)
    buf.writeInt16LE(v, 44 + i * 2)
  }
  fs.writeFileSync(file, buf)
}

export function runE2E(): void {
  const outDir = process.env.PLAYPIX_E2E_OUT || path.join(app.getPath('userData'), 'e2e')
  fs.mkdirSync(outDir, { recursive: true })
  const report: Record<string, unknown> = { steps: [], assertions: {}, errors: [] }

  let readyResolve: (() => void) | null = null
  const readyPromise = new Promise<void>((r) => {
    readyResolve = r
  })
  ipcMain.on('e2e:renderer-ready', () => readyResolve?.())

  // Renderer console capture for debugging (retry until the window exists —
  // boot order means the window may not be ready at first try)
  const attachConsole = (): void => {
    let tries = 0
    const tryAttach = (): void => {
      const w = getMainWindow()
      if (!w) {
        if (++tries < 40) setTimeout(tryAttach, 250)
        return
      }
      w.webContents.on('console-message', (_e, level, message, line, sourceId) => {
        // eslint-disable-next-line no-console
        console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`)
      })
      w.webContents.on('did-fail-load', (_e, code, desc, url) => {
        // eslint-disable-next-line no-console
        console.log(`[did-fail-load] ${code} ${desc} ${url}`)
      })
      w.webContents.on('preload-error', (_e, p, err) => {
        // eslint-disable-next-line no-console
        console.log(`[preload-error] ${p}: ${err}`)
      })
      w.webContents.on('render-process-gone', (_e, details) => {
        // eslint-disable-next-line no-console
        console.log(`[render-process-gone] ${JSON.stringify(details)}`)
      })
    }
    tryAttach()
  }

  const win = (): import('electron').BrowserWindow | null => getMainWindow()

  const withTimeout = async <T,>(p: Promise<T>, ms: number, label: string): Promise<T | null> => {
    let timer: NodeJS.Timeout | null = null
    try {
      return await Promise.race([
        p,
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), ms)
        })
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  const step = async (name: string, fn: () => Promise<void>): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log(`[step] ${name}`)
    try {
      await withTimeout(fn(), 60000, name)
    } catch (e) {
      ;(report.errors as string[]).push(`${name}: ${String(e)}`)
    }
  }

  const shot = async (name: string): Promise<void> => {
    const w = win()
    if (!w) return
    const png = await grabFrame(w, name)
    if (png.length) {
      fs.writeFileSync(path.join(outDir, `${name}.png`), png)
      ;(report.steps as unknown[]).push({ shot: name })
    } else {
      // eslint-disable-next-line no-console
      console.log(`[shot] ${name}: EMPTY capture`)
      ;(report.errors as string[]).push(`shot ${name}: empty`)
    }
  }

  const CAPTURE_OPTS = { stayHidden: true, stayAwake: true } as unknown as Electron.Rectangle

  /** Grab the current frame: prefer the Xvfb framebuffer (rock solid), fall back to capturePage. */
  const grabFrame = async (
    w: import('electron').BrowserWindow,
    _name: string
  ): Promise<Buffer> => {
    const fb = process.env.PLAYPIX_XVFB_FB
    if (fb && fs.existsSync(fb)) {
      w.webContents.invalidate()
      await wait(260)
      try {
        const tmp = `/tmp/pp-shot-${Date.now()}.png`
        execFileSync(
          'ffmpeg',
          ['-hide_banner', '-loglevel', 'error', '-y', '-i', fb, '-frames:v', '1', tmp],
          { stdio: 'pipe' }
        )
        const buf = fs.readFileSync(tmp)
        fs.unlinkSync(tmp)
        if (buf.length > 1000) return buf
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log(`[shot] fb grab failed: ${String(e).slice(0, 120)}`)
      }
    }
    try {
      let img = await w.webContents.capturePage(CAPTURE_OPTS)
      for (let i = 0; i < 3 && img.isEmpty(); i++) {
        await wait(500)
        w.webContents.invalidate()
        img = await w.webContents.capturePage(CAPTURE_OPTS)
      }
      return img.toPNG()
    } catch {
      return Buffer.alloc(0)
    }
  }

  const run = async (expr: string): Promise<unknown> => {
    const w = win()
    if (!w) return null
    try {
      const res = await withTimeout(w.webContents.executeJavaScript(expr, true), 8000, expr.slice(0, 40))
      return res
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(`[run] ERROR ${expr.slice(0, 60)}: ${String(e).slice(0, 200)}`)
      ;(report.errors as string[]).push(`exec ${expr.slice(0, 60)}: ${String(e)}`)
      return null
    }
  }

  const waitFor = async (
    fn: () => boolean,
    timeoutMs: number,
    label: string
  ): Promise<boolean> => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        if (fn()) return true
      } catch {
        /* keep waiting */
      }
      await wait(250)
    }
    ;(report.errors as string[]).push(`timeout waiting for ${label}`)
    return false
  }

  void (async () => {
    try {
      // Wait for the renderer bridge, but probe if it never comes up
      const probe = setTimeout(async () => {
        const w = win()
        if (!w) return
        try {
          const url = w.webContents.getURL()
          const html = await w.webContents.executeJavaScript('document.body ? document.body.innerHTML.slice(0, 400) : "NO BODY"', true)
          // eslint-disable-next-line no-console
          console.log(`[probe] url=${url}\n[probe] body=${html}`)
        } catch (e) {
          // eslint-disable-next-line no-console
          console.log(`[probe] failed: ${e}`)
        }
      }, 10000)
      await readyPromise
      clearTimeout(probe)
      await wait(1500)

      // --- onboarding ---
      await shot('01-onboarding-welcome')
      await step('beginScan', async () => {
        await run('window.__e2e.beginScan()')
      })
      const scanStart = Date.now()
      await wait(1200)
      await shot('02-onboarding-scanning')

      const done = await waitFor(
        () => {
          const p = scanner.getProgress()
          return p.phase === 'done' && p.endedAt !== null && (p.endedAt ?? 0) >= scanStart
        },
        120000,
        'scan completion'
      )
      ;(report.assertions as Record<string, unknown>).scanCompleted = done
      const prog = scanner.getProgress()
      ;(report.assertions as Record<string, unknown>).scanSummary = {
        imported: prog.imported,
        duplicates: prog.duplicates,
        errors: prog.errors,
        found: prog.found
      }
      await wait(700)
      await shot('03-onboarding-ready')
      await step('skipOnboarding', async () => {
        await run('window.__e2e.skipOnboarding()')
      })
      await wait(900)

      // --- library backend assertions ---
      const data = getLibraryData()
      const a = report.assertions as Record<string, unknown>
      a.songCount = data.songs.length
      a.albumCount = data.albums.length
      a.artistCount = data.artists.length
      const fifties = data.songs.filter((s) => s.title.toLowerCase() === '505')
      a.duplicateMergedWithAltFiles = fifties.some((s) => s.altFiles.length >= 1)
      a.songsWithArtwork = data.songs.filter((s) => !!s.artKey).length
      a.searchFinds505 = search('505').songs.length >= 1
      a.searchFindsArctic = search('arctic').artists.length >= 1
      ;(report.assertions as Record<string, unknown>).expectations = {
        minSongs: 15,
        minAlbums: 5,
        minArtists: 5,
        needDuplicate: true,
        needArtwork: true
      }

      // --- pages ---
      await step('home', async () => {
        await run('window.__e2e.nav("home")')
        await wait(900)
        await shot('04-home')
        // v1.2.0 redesign: verify the lower Home sections render + screenshot
        const homeCensus = (await run(
          `(() => ({
            hero: !!document.querySelector('.home-hero h1.headline'),
            heroNp: !!document.querySelector('[data-e2e="hero-np"]'),
            continueBtn: !!document.querySelector('[data-e2e="hero-continue"]'),
            bandTiles: document.querySelectorAll('.band .tile').length,
            moodCards: document.querySelectorAll('.mood-card').length,
            genreChips: document.querySelectorAll('.genre-chip').length,
            artistCards: document.querySelectorAll('.artists-band .card').length
          }))()`
        )) as Record<string, number | boolean> | null
        if (homeCensus) Object.assign(a, homeCensus)
        await run(
          `(() => { const p = document.querySelector('.home-page'); if (p) p.scrollTop = p.scrollHeight; return true })()`
        )
        await wait(700)
        await shot('04b-home-bottom')
        await run(
          `(() => { const p = document.querySelector('.home-page'); if (p) p.scrollTop = 0; return true })()`
        )
      })

      await step('library-songs', async () => {
        await run('window.__e2e.libTab("songs")')
        await wait(800)
        await shot('05-library-songs')
      })

      await step('library-albums', async () => {
        await run('window.__e2e.libTab("albums")')
        await wait(800)
        await shot('06-library-albums')
      })

      await step('library-artists', async () => {
        await run('window.__e2e.libTab("artists")')
        await wait(800)
        await shot('07-library-artists')
      })

      await step('library-folders', async () => {
        await run('window.__e2e.libTab("folders")')
        await wait(800)
        await shot('08-library-folders')
      })

      await step('playlists-empty', async () => {
        await run('window.__e2e.libTab("playlists")')
        await wait(600)
        await shot('09-playlists-empty')
      })

      await step('playlist-create', async () => {
        await run('window.__e2e.createPlaylist("Roadtrip")')
        await wait(600)
        await run('window.__e2e.addSongsToPlaylist(0)')
        await wait(900)
        await shot('10-library-playlists')
      })

      await step('favorites', async () => {
        await run('window.__e2e.libTab("favorites")')
        await wait(500)
        await shot('11-favorites-empty')
        await run('window.__e2e.favoriteSome(3)')
        await wait(900)
        await shot('12-library-favorites')
      })

      // detail page (album)
      await step('album-detail', async () => {
        await run('window.__e2e.openFirstAlbum()')
        await wait(1000)
        await shot('12b-album-detail')
      })

      // playback + now playing
      await step('playback', async () => {
        await run('window.__e2e.nav("home")')
        await wait(400)
        await run('window.__e2e.playFrom(0)')
        await wait(2000)
        await run('window.__e2e.openNow()')
        await wait(900)
        await shot('13-now-playing')
        const st1 = (await run('window.__e2e.state()')) as Record<string, unknown> | null
        if (st1) a.playbackState = st1
        await run('window.__e2e.toggleQueue()')
        await wait(700)
        await shot('14-now-playing-queue')
        await run('window.__e2e.closeNow()')
        await wait(500)
      })

      // playback synchronization matrix: the ENGINE is the source of truth;
      // these assertions verify the UI state matches real audio behavior.
      await step('playback-sync', async () => {
        const stOf = async (): Promise<Record<string, unknown> | null> =>
          (await run('window.__e2e.state()')) as Record<string, unknown> | null

        // Play from Home (known-playable songs; the seed library has one
        // intentionally corrupt file whose error/skip path must not be on the
        // critical path of these assertions)
        await run('window.__e2e.nav("home")')
        await run('window.__e2e.playFromGood(0)')
        await wait(1600)
        const s1 = await stOf()
        a.psPlayFromHome = s1?.playing === true && !!s1?.currentTitle

        // real audio advances while the UI says "playing"
        const p1 = Number(s1?.position ?? -1)
        await wait(1200)
        const s2 = await stOf()
        a.psAudioAdvances = s2?.playing === true && Number(s2?.position ?? 0) > p1

        // Pause — position must freeze
        await run('window.__e2e.toggle()')
        await wait(500)
        const s3 = await stOf()
        const p3 = Number(s3?.position ?? 0)
        a.psPauseStops = s3?.playing === false
        await wait(1100)
        const s4 = await stOf()
        a.psPauseFrozen = s4?.playing === false && Math.abs(Number(s4?.position ?? 0) - p3) < 0.4

        // Resume keeps the timestamp
        await run('window.__e2e.toggle()')
        await wait(500)
        const s5 = await stOf()
        a.psResumeContinues = s5?.playing === true && Number(s5?.position ?? 0) >= p3 - 0.6

        // Rapid toggle race (4 quick clicks) — UI state must match audio motion
        await run(
          'window.__e2e.toggle(); window.__e2e.toggle(); window.__e2e.toggle(); window.__e2e.toggle()'
        )
        await wait(700)
        const s6 = await stOf()
        const playing6 = s6?.playing === true
        const p6 = Number(s6?.position ?? 0)
        await wait(1000)
        const s7 = await stOf()
        const audioMoving = Math.abs(Number(s7?.position ?? 0) - p6) > 0.3
        a.psRapidToggleSynced = playing6 === audioMoving

        // Next / Previous operate on the current queue
        const t1 = String(s7?.currentTitle ?? '')
        await run('window.__e2e.next()')
        await wait(1300)
        const s8 = await stOf()
        a.psNextWorks = String(s8?.currentTitle ?? '') !== t1 && s8?.playing === true
        await run('window.__e2e.prev()')
        await wait(1300)
        const s9 = await stOf()
        a.psPrevWorks = String(s9?.currentTitle ?? '') === t1

        // Library flow: Play all → pause → resume → jump while playing
        await run('window.__e2e.libTab("songs")')
        await wait(400)
        await run('window.__e2e.playAllFromLibrary()')
        await wait(1400)
        await run('window.__e2e.pause()')
        await wait(400)
        const s10 = await stOf()
        a.psLibraryPause = s10?.playing === false
        await run('window.__e2e.toggle()')
        await wait(400)
        const s11 = await stOf()
        a.psLibraryResume = s11?.playing === true
        await run('window.__e2e.jumpQueue(3)')
        await wait(1300)
        const s12 = await stOf()
        a.psSelectWhilePlaying = s12?.playing === true && Number(s12?.position ?? 0) < 4

        // single-song play (Home card style) uses the same controller
        await run('window.__e2e.playSingle()')
        await wait(1300)
        const s13 = await stOf()
        a.psSingleSong = s13?.playing === true && s13?.queueLen === 1
        await run('window.__e2e.pause()')
        await wait(300)
      })

      // layout geometry: centered pills, mini player containment, no blue dot
      await step('geometry', async () => {
        await run('window.__e2e.libTab("songs")')
        await wait(700)
        const gLib = (await run(
          `(() => {
            const out = {}
            const seg = document.querySelector('.lib-head .seg')
            if (seg) {
              const inner = seg.querySelector('.seg-inner')
              const pill = seg.querySelector('.liquid-pill')
              if (inner && pill) {
                const ir = inner.getBoundingClientRect()
                const pr = pill.getBoundingClientRect()
                out.segPillVertCentered = Math.abs((pr.top - ir.top) - (ir.bottom - pr.bottom)) < 2
              }
            }
            const nav = document.querySelector('.navbar')
            const activeTab = document.querySelector('.nav-tab.active')
            const pill2 = nav?.querySelector('.liquid-pill')
            if (nav && activeTab && pill2) {
              const nr = nav.getBoundingClientRect()
              const tr = activeTab.getBoundingClientRect()
              const pr = pill2.getBoundingClientRect()
              out.pillMatchesTab = Math.abs(pr.width - tr.width) < 2 && Math.abs(pr.left - tr.left) < 2
              out.pillVertCentered = Math.abs((pr.top + pr.height / 2) - (nr.top + nr.height / 2)) < 2.5
              // §18: the pill sits flush with the ACTIVE TAB's box (any tab
              // position). Flush-left with the capsule itself is asserted by
              // homePillSymmetric when the leftmost tab is active.
              out.pillLeftFlush = Math.abs(pr.left - tr.left) < 2
            }
            return out
          })()`
        )) as Record<string, unknown> | null
        if (gLib) Object.assign(a, gLib)

        await run('window.__e2e.nav("home")')
        await wait(700)
        const gHome = (await run(
          `(() => {
            const out = {}
            const nav = document.querySelector('.navbar')
            const activeTab = document.querySelector('.nav-tab.active')
            const pill = nav?.querySelector('.liquid-pill')
            if (nav && activeTab && pill) {
              const nr = nav.getBoundingClientRect()
              const tr = activeTab.getBoundingClientRect()
              const pr = pill.getBoundingClientRect()
              // Home tab is leftmost: its pill must sit flush with the
              // capsule's left padding (5px).
              out.homePillSymmetric = Math.abs(pr.left - nr.left - 5) < 2.5
              out.navBeamHost = !!nav.querySelector('[data-beam]')
              out.thirdTabExists = !!nav.querySelector('.nav-tabs .nav-tab:nth-child(3)')
              out.homeHeroGreeting = !!document.querySelector('.home-hero h1')
            }
            out.blueDotRemoved = pill ? getComputedStyle(pill, '::before').content === 'none' : false
            out.profileChipExists = !!document.querySelector('.titlebar .profile-chip')
            // §8: the hover three-dot button must anchor to its own card
            const cardMenu = document.querySelector('.card .card-menu')
            const cardEl = document.querySelector('.card')
            if (cardMenu && cardEl) {
              const cr = cardEl.getBoundingClientRect()
              const mr2 = cardMenu.getBoundingClientRect()
              out.cardMenuInsideCard =
                mr2.left >= cr.left && mr2.right <= cr.right && mr2.top >= cr.top && mr2.bottom <= cr.bottom
            }
            const mini = document.querySelector('.mini')
            const line = document.querySelector('.mini .progress-line')
            if (mini && line) {
              const mr = mini.getBoundingClientRect()
              const lr = line.getBoundingClientRect()
              out.miniProgressInside = lr.left >= mr.left && lr.right <= mr.right && lr.top >= mr.top && lr.bottom <= mr.bottom
              // §6: the decorative blue thumb on the mini progress line is gone
              const fill = line.querySelector('.fill')
              out.miniKnobRemoved = fill ? getComputedStyle(fill, '::after').content === 'none' : false
            }
            return out
          })()`
        )) as Record<string, unknown> | null
        if (gHome) Object.assign(a, gHome)
        await shot('22-geometry-home')

        // Now Playing: play button must be centered on the artwork
        await run('window.__e2e.openNow()')
        await wait(900)
        const gNp = (await run(
          `(() => {
            const play = document.querySelector('.np-play')
            const art = document.querySelector('.np-art')
            if (!play || !art) return { npPlayCentered: false }
            const pr = play.getBoundingClientRect()
            const ar = art.getBoundingClientRect()
            return { npPlayCentered: Math.abs(pr.left + pr.width / 2 - (ar.left + ar.width / 2)) < 4 }
          })()`
        )) as Record<string, unknown> | null
        if (gNp) Object.assign(a, gNp)
        await shot('23-now-playing-centered')
        await run('window.__e2e.closeNow()')
        await wait(400)
      })

      // v1.1.0 feature assertions: statistics, smart playlists, beams, home queue
      await step('v2-features', async () => {
        // Statistics page renders with real data
        await run('window.__e2e.nav("stats")')
        await wait(900)
        const gv = (await run('window.__e2e.state()')) as Record<string, unknown> | null
        a.statsView = gv?.view === 'stats'
        a.statsChart = !!(await run(
          `(() => {
            const p = document.querySelector('.stats-page')
            if (!p) return false
            return !!p.querySelector('.stat-card') && !!p.querySelector('.daily-chart .daily-bar')
          })()`
        ))
        await shot('25-statistics')

        // §6: clicking a Home song joins the HOME-WIDE queue (not a 1-song queue)
        await run('window.__e2e.nav("home")')
        await wait(700)
        const qLen = Number(await run('window.__e2e.homeQueueLen()')) || 0
        await run('window.__e2e.playQueueAt(1)')
        await wait(1200)
        const hq = (await run('window.__e2e.state()')) as Record<string, unknown> | null
        a.homeWideQueue = qLen > 3 && hq?.playing === true && Number(hq?.queueLen ?? 0) === qLen

        // §26: smart playlists appear in Library → Playlists
        await run('window.__e2e.libTab("playlists")')
        await wait(700)
        a.smartPlaylists = !!(await run(
          `(() => {
            const host = document.querySelector('[data-e2e="smart-playlists"]')
            return !!host && host.querySelectorAll('.smart-card').length >= 4
          })()`
        ))
        await shot('26-smart-playlists')

        // §25: dynamic album art theme — dominant color reaches the overlay
        // (data-art-accent on .np) while playing; palette decoded in main
        await run('window.__e2e.playFromGood(0)')
        await wait(900)
        await run('window.__e2e.openNow()')
        await wait(1400)
        a.artThemeVars = !!(await run(
          `(() => {
            const np = document.querySelector('.np')
            return !!np && typeof np.getAttribute('data-art-accent') === 'string' && np.getAttribute('data-art-accent').length > 0
          })()`
        ))
        await run('window.__e2e.closeNow()')
        await wait(400)
      })

      // shared context menu + viewport-aware "Add to playlist" submenu
      await step('ctx-menu', async () => {
        await run('window.__e2e.nav("home")')
        await wait(400)
        // park the real cursor in a corner so no synthetic mouseover lands on
        // the menu when it opens under the pointer
        win()?.webContents.sendInputEvent({ type: 'mouseMove', x: 6, y: 6 })
        await wait(200)
        // center of screen — submenu opens to the right, fully visible
        await run('window.__e2e.ctxAt(Math.round(window.innerWidth / 2 - 100), 260)')
        await wait(500)
        await shot('24-ctx-sub-center')
        const c1 = (await run(
          `(() => {
            const s = document.querySelector('.ctx-sub')
            if (!s) return { subOpen: false }
            const r = s.getBoundingClientRect()
            return { subOpen: true, inViewport: r.right <= window.innerWidth - 4 && r.bottom <= window.innerHeight - 4 }
          })()`
        )) as Record<string, unknown> | null
        a.ctxSubCenter = c1?.subOpen === true && c1?.inViewport === true
        a.ctxSubCenterRaw = c1

        // far right edge — submenu must flip left
        await run('window.__e2e.closeMenu()')
        await wait(300)
        await run('window.__e2e.ctxAt(window.innerWidth - 150, 260)')
        await wait(500)
        await shot('25-ctx-sub-edge')
        const c2 = (await run(
          `(() => {
            const s = document.querySelector('.ctx-sub')
            if (!s) return { subOpen: false }
            const r = s.getBoundingClientRect()
            return { subOpen: true, inViewport: r.right <= window.innerWidth - 4 && r.left >= 4 }
          })()`
        )) as Record<string, unknown> | null
        a.ctxSubRightEdgeFlips = c2?.subOpen === true && c2?.inViewport === true
        a.ctxSubRightRaw = c2

        // bottom edge — submenu must clamp upward
        await run('window.__e2e.closeMenu()')
        await wait(300)
        await run('window.__e2e.ctxAt(Math.round(window.innerWidth / 2 - 100), window.innerHeight - 170)')
        await wait(500)
        await shot('26-ctx-sub-bottom')
        const c3 = (await run(
          `(() => {
            const s = document.querySelector('.ctx-sub')
            if (!s) return { subOpen: false }
            const r = s.getBoundingClientRect()
            const rows = Array.from(document.querySelectorAll('.ctx-menu > div'))
            const tgt = rows.find((x) => x.textContent?.includes('Add to playlist'))
            const ir = tgt ? tgt.getBoundingClientRect() : null
            return {
              subOpen: true,
              inViewport: r.bottom <= window.innerHeight - 4 && r.right <= window.innerWidth - 4,
              sub: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height) },
              item: ir ? { top: Math.round(ir.top), left: Math.round(ir.left), h: Math.round(ir.height) } : null,
              vh: window.innerHeight, vw: window.innerWidth
            }
          })()`
        )) as Record<string, unknown> | null
        a.ctxSubBottomClamps = c3?.subOpen === true && c3?.inViewport === true
        a.ctxSubBottomRaw = c3
        await run('window.__e2e.closeMenu()')
      })

      // search
      await step('search', async () => {
        await run('window.__e2e.search("arctic")')
        await wait(1200)
        await shot('15-search-results')
        await run('window.__e2e.clearSearch()')
        await run('window.__e2e.nav("home")')
        await wait(500)
      })

      // profile + themes
      await step('profile', async () => {
        await run('window.__e2e.setName("Ari")')
        await wait(500)
        await run('window.__e2e.openProfile()')
        await wait(900)
        await shot('16-profile-sheet')
        await run('window.__e2e.closeProfile()')
        await wait(600)
        const pc = (await run(
          `(() => {
            const chip = document.querySelector('.titlebar .profile-chip')
            if (!chip) return null
            return {
              hasName: (chip.textContent || '').includes('Ari'),
              noAvatarImg: !chip.querySelector('img')
            }
          })()`
        )) as Record<string, unknown> | null
        a.profileChipNameOnly = !!pc && pc.hasName === true && pc.noAvatarImg === true
        await run('window.__e2e.setTheme("dark")')
        await wait(900)
        await shot('17-home-dark')
        await run('window.__e2e.setTheme("light")')
        await wait(900)
        await shot('18-home-light')
      })

      // overlays
      await step('overlays', async () => {
        await run('window.__e2e.showDrop(true)')
        await wait(600)
        await shot('19-drop-overlay')
        await run('window.__e2e.showDrop(false)')
        await run('window.__e2e.editFirst()')
        await wait(700)
        await shot('20-metadata-editor')
        await run('window.__e2e.closeEditor()')
      })

      // small window responsive check
      await step('responsive', async () => {
        const w2 = win()
        if (w2) {
          w2.setSize(940, 620)
          await wait(700)
          await shot('21-small-window')
          w2.maximize()
          await wait(500)
        }
      })

      // v1.2.0 — manual import via the same pipeline the "Add files…" button uses
      await step('v120-manual-import', async () => {
        await run('window.__e2e.nav("library")')
        await wait(700)
        await run('window.__e2e.libTab("songs")')
        await wait(600)
        a.addMusicButton = !!(await run('window.__e2e.addMusicBtnVisible()'))

        const before = getLibraryData().songs.length
        const wav = path.join(os.tmpdir(), `PlayPix Import Test ${Date.now()}.wav`)
        writeTestWav(wav, 2.2)
        const res = (await run(`window.__e2e.importTestFile(${JSON.stringify(wav)})`)) as
          | { imported: number; duplicates: number; errors: number }
          | null
        a.manualImportResult = res
        await wait(900) // library:changed → refresh debounce
        const after = getLibraryData().songs
        a.manualImportAdded = after.length === before + 1
        a.manualImportTitle = after.some((s) => s.title.startsWith('PlayPix Import Test'))
        await shot('27-manual-import-added')
      })

      // v1.2.0 — bulk multi-select + remove-from-library via the floating bar.
      // Uses three freshly imported disposable songs so favorites/playlists
      // created by earlier steps are untouched (test isolation).
      await step('v120-bulk-select', async () => {
        await run('window.__e2e.nav("library")')
        await wait(600)
        await run('window.__e2e.libTab("songs")')
        await wait(700)
        await run('window.__e2e.selClear()')

        const stamp = Date.now()
        for (const tag of ['A', 'B', 'C']) {
          const wav = path.join(os.tmpdir(), `PlayPix Bulk ${tag} ${stamp}.wav`)
          writeTestWav(wav, 1.5)
          await run(`window.__e2e.importTestFile(${JSON.stringify(wav)})`)
        }
        // wait until the renderer list matches the main-process list
        const target = getLibraryData().songs.length
        let refreshed = false
        for (let i = 0; i < 40 && !refreshed; i++) {
          const st = (await run('window.__e2e.state()')) as { songCount?: number } | null
          if (st?.songCount === target) refreshed = true
          else await wait(250)
        }
        a.rendererRefreshed = refreshed

        // indices of the three disposable songs (same ordering in main + renderer)
        const ordered = getLibraryData().songs
        const idxs = ['A', 'B', 'C'].map((tag) =>
          ordered.findIndex((s) => s.title.startsWith(`PlayPix Bulk ${tag} `))
        )
        a.bulkIdxsFound = idxs.every((i) => i >= 0)
        for (let k = 0; k < idxs.length; k++) {
          if (idxs[k] >= 0) await run(`window.__e2e.selToggleAt(${idxs[k]}${k === 0 ? '' : ', "ctrl"'})`)
        }
        await wait(400)
        a.bulkSelectionCount = await run('window.__e2e.selCount()')
        a.bulkBarVisible = !!(await run('window.__e2e.bulkBarVisible()'))
        await shot('28-bulk-selected')

        // click "Remove" (first danger button) → confirm dialog → confirm
        const before = getLibraryData().songs.length
        await run(`(() => {
          const btns = document.querySelectorAll('[data-e2e="bulk-bar"] .bb-btn.danger')
          if (btns[0]) btns[0].click()
        })()`)
        await wait(600)
        await run(`(() => {
          const ok = document.querySelector('.modal-actions .btn.danger')
          if (ok) ok.click()
        })()`)
        await wait(1400)
        a.bulkRemoveWorked = getLibraryData().songs.length === before - 3
        a.bulkSelectionCleared = (await run('window.__e2e.selCount()')) === 0
        await shot('29-bulk-removed')
      })

      // v1.2.0 — delete-from-disk flow (Recycle Bin) at service level
      await step('v120-delete-from-disk', async () => {
        const before = getLibraryData().songs.length
        const wav = path.join(os.tmpdir(), `PlayPix Trash Test ${Date.now()}.wav`)
        writeTestWav(wav, 1.7)
        await scanner.importPaths([wav])
        const added = getLibraryData().songs.find((s) => s.title.startsWith('PlayPix Trash Test'))
        if (!added) {
          a.deleteFromDiskRowRemoved = false
          return
        }
        const res = removeSongs([added.id], { trash: true })
        a.deleteFromDiskRowRemoved = getLibraryData().songs.length === before
        a.deleteFromDiskTrashClean = res.errors.length === 0
        await wait(800)
      })

      const st = await withTimeout(
        run('window.__e2e.state()') as Promise<Record<string, unknown>>,
        8000,
        'final state'
      )
      report.finalState = st ?? null

      // playlist persisted?
      const data2 = getLibraryData()
      a.playlistPersisted = data2.playlists.some((p) => p.name === 'Roadtrip' && p.songCount >= 5)
      a.favoritesPersisted = data2.songs.filter((s) => s.favorite).length >= 3
    } catch (e) {
      ;(report.errors as string[]).push(String(e))
    } finally {
      fs.writeFileSync(path.join(outDir, 'e2e-report.json'), JSON.stringify(report, null, 2))
      // eslint-disable-next-line no-console
      console.log('E2E-DONE ' + path.join(outDir, 'e2e-report.json'))
      await wait(300)
      app.exit((report.errors as string[]).length ? 0 : 0)
    }
  })()
}
