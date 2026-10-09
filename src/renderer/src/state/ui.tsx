// PlayPix renderer — UI state: navigation, overlays, theme, toasts, menus, dialogs
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import type { ReactNode } from 'react'
import { api } from '../lib/api'
import type { Song, SmartKind, ThemeMode } from '../../../shared/types'

export type LibraryTab = 'songs' | 'albums' | 'artists' | 'folders' | 'playlists' | 'favorites'

export type DetailTarget =
  | { type: 'album'; key: string; name?: string }
  | { type: 'artist'; key: string; name?: string }
  | { type: 'folder'; path: string; name?: string }
  | { type: 'playlist'; id: number; name?: string }
  | { type: 'smart'; kind: SmartKind; name?: string }

export type View =
  | { name: 'home' }
  | { name: 'library' }
  | { name: 'stats' }
  | { name: 'search' }
  | { name: 'detail'; detail: DetailTarget }

export interface CtxMenuItem {
  label: string
  icon?: string
  danger?: boolean
  onClick?: () => void
  sub?: CtxMenuItem[]
  sep?: boolean
}

export interface CtxMenuState {
  x: number
  y: number
  items: CtxMenuItem[]
  /** E2E hook: open this labeled submenu immediately (tests positioning). */
  openSub?: string
}

export interface ToastItem {
  id: number
  msg: string
  kind: 'info' | 'error'
}

interface ConfirmOpts {
  title: string
  body?: string
  okLabel?: string
  danger?: boolean
}

interface UIContextValue {
  view: View
  navigate: (v: View) => void
  replace: (v: View) => void
  back: () => void
  canBack: boolean

  libraryTab: LibraryTab
  setLibraryTab: (t: LibraryTab) => void

  searchOpen: boolean
  searchQuery: string
  openSearch: (initial?: string) => void
  closeSearch: () => void
  setSearchQuery: (q: string) => void
  commitSearch: (term: string) => void

  nowPlaying: boolean
  setNowPlaying: (v: boolean) => void
  queueOpen: boolean
  setQueueOpen: (v: boolean) => void
  profileOpen: boolean
  setProfileOpen: (v: boolean) => void

  themeMode: ThemeMode
  setThemeMode: (t: ThemeMode) => void
  effectiveTheme: 'light' | 'dark'

  settings: Record<string, unknown>
  updateSetting: (k: string, v: unknown) => void

  toast: (msg: string, kind?: 'info' | 'error') => void
  toasts: ToastItem[]
  dismissToast: (id: number) => void

  ctxMenu: CtxMenuState | null
  openCtxMenu: (x: number, y: number, items: CtxMenuItem[], openSub?: string) => void
  closeCtxMenu: () => void

  confirm: (opts: ConfirmOpts) => Promise<boolean>
  confirmState: (ConfirmOpts & { resolve: (v: boolean) => void }) | null
  prompt: (opts: { title: string; value?: string; okLabel?: string }) => Promise<string | null>
  promptState:
    | ({ title: string; value: string; okLabel?: string; resolve: (v: string | null) => void })
    | null

  editSong: Song | null
  setEditSong: (s: Song | null) => void

  dropActive: boolean
  setDropActive: (v: boolean) => void

  onboardingDone: boolean | undefined
  finishOnboarding: (startScan?: boolean) => void
}

const UIContext = createContext<UIContextValue | null>(null)

export function useUI(): UIContextValue {
  const ctx = useContext(UIContext)
  if (!ctx) throw new Error('useUI outside provider')
  return ctx
}

let toastSeq = 1

export function UIProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>({ name: 'home' })
  const [history, setHistory] = useState<View[]>([])
  const [libraryTab, setLibraryTab] = useState<LibraryTab>('songs')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [nowPlaying, setNowPlaying] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system')
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null)
  const [confirmState, setConfirmState] = useState<
    (ConfirmOpts & { resolve: (v: boolean) => void }) | null
  >(null)
  const [promptState, setPromptState] = useState<
    | { title: string; value: string; okLabel?: string; resolve: (v: string | null) => void }
    | null
  >(null)
  const [editSong, setEditSong] = useState<Song | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  const settingsLoaded = useRef(false)

  // settings bootstrap
  useEffect(() => {
    void api.getSettings().then((s) => {
      setSettings(s)
      const t = s['theme']
      if (t === 'light' || t === 'dark' || t === 'system') setThemeModeState(t)
      settingsLoaded.current = true
    })
  }, [])

  // system theme tracking
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const fn = (e: MediaQueryListEvent): void => setSystemDark(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  const effectiveTheme: 'light' | 'dark' =
    themeMode === 'system' ? (systemDark ? 'dark' : 'light') : themeMode

  useEffect(() => {
    const html = document.documentElement
    const prev = html.dataset.theme
    html.dataset.theme = effectiveTheme
    if (prev && prev !== effectiveTheme) {
      document.body.classList.add('theme-anim')
      const t = setTimeout(() => document.body.classList.remove('theme-anim'), 480)
      return () => clearTimeout(t)
    }
  }, [effectiveTheme])

  const navigate = useCallback((v: View) => {
    setView((cur) => {
      setHistory((h) => [...h.slice(-20), cur])
      return v
    })
    setCtxMenu(null)
  }, [])

  const replace = useCallback((v: View) => {
    setView(v)
    setCtxMenu(null)
  }, [])

  const back = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h
      const prev = h[h.length - 1]
      setView(prev)
      return h.slice(0, -1)
    })
  }, [])

  const toast = useCallback((msg: string, kind: 'info' | 'error' = 'info') => {
    const id = toastSeq++
    setToasts((t) => [...t.slice(-3), { id, msg, kind }])
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id))
    }, 3600)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const openCtxMenu = useCallback((x: number, y: number, items: CtxMenuItem[], openSub?: string) => {
    setCtxMenu({ x, y, items, openSub })
  }, [])
  const closeCtxMenu = useCallback(() => setCtxMenu(null), [])

  const confirm = useCallback(
    (opts: ConfirmOpts) =>
      new Promise<boolean>((resolve) => {
        setConfirmState({
          ...opts,
          resolve: (ok: boolean) => {
            setConfirmState(null)
            resolve(ok)
          }
        })
      }),
    []
  )

  const prompt = useCallback(
    (opts: { title: string; value?: string; okLabel?: string }) =>
      new Promise<string | null>((resolve) => {
        setPromptState({
          title: opts.title,
          value: opts.value ?? '',
          okLabel: opts.okLabel,
          resolve: (val: string | null) => {
            setPromptState(null)
            resolve(val)
          }
        })
      }),
    []
  )

  const updateSetting = useCallback((k: string, v: unknown) => {
    setSettings((s) => ({ ...s, [k]: v }))
    void api.setSetting(k, v)
  }, [])

  const setThemeMode = useCallback(
    (t: ThemeMode) => {
      setThemeModeState(t)
      updateSetting('theme', t)
    },
    [updateSetting]
  )

  const openSearch = useCallback(
    (initial?: string) => {
      if (initial !== undefined) setSearchQuery(initial)
      setSearchOpen(true)
      navigate({ name: 'search' })
    },
    [navigate]
  )

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery('')
  }, [])

  const commitSearch = useCallback((term: string) => {
    if (term.trim()) void api.addSearchTerm(term.trim())
  }, [])

  const onboardingDone = settings['onboardingDone'] as boolean | undefined
  const finishOnboarding = useCallback(
    (startScan?: boolean) => {
      updateSetting('onboardingDone', true)
      if (startScan) void api.startScan()
    },
    [updateSetting]
  )

  // Esc closes topmost overlay
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (ctxMenu) closeCtxMenu()
        else if (confirmState) {
          confirmState.resolve(false)
          setConfirmState(null)
        } else if (promptState) {
          promptState.resolve(null)
          setPromptState(null)
        } else if (editSong) setEditSong(null)
        else if (queueOpen) setQueueOpen(false)
        else if (profileOpen) setProfileOpen(false)
        else if (nowPlaying) setNowPlaying(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ctxMenu, confirmState, promptState, editSong, queueOpen, profileOpen, nowPlaying, closeCtxMenu])

  const value = useMemo<UIContextValue>(
    () => ({
      view,
      navigate,
      replace,
      back,
      canBack: history.length > 0,
      libraryTab,
      setLibraryTab,
      searchOpen,
      searchQuery,
      openSearch,
      closeSearch,
      setSearchQuery,
      commitSearch,
      nowPlaying,
      setNowPlaying,
      queueOpen,
      setQueueOpen,
      profileOpen,
      setProfileOpen,
      themeMode,
      setThemeMode,
      effectiveTheme,
      settings,
      updateSetting,
      toast,
      toasts,
      dismissToast,
      ctxMenu,
      openCtxMenu,
      closeCtxMenu,
      confirm,
      confirmState,
      prompt,
      promptState,
      editSong,
      setEditSong,
      dropActive,
      setDropActive,
      onboardingDone,
      finishOnboarding
    }),
    [
      view,
      navigate,
      replace,
      back,
      history.length,
      libraryTab,
      searchOpen,
      searchQuery,
      openSearch,
      closeSearch,
      commitSearch,
      nowPlaying,
      queueOpen,
      profileOpen,
      themeMode,
      setThemeMode,
      effectiveTheme,
      settings,
      updateSetting,
      toast,
      toasts,
      dismissToast,
      ctxMenu,
      openCtxMenu,
      closeCtxMenu,
      confirm,
      confirmState,
      prompt,
      promptState,
      editSong,
      dropActive,
      onboardingDone,
      finishOnboarding
    ]
  )

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}
