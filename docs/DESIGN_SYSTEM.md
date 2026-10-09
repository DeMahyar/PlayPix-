# PlayPix — Design System

The visual contract of PlayPix. Every new surface must be assembled from these tokens —
never hard-code colors/radii/durations. Source of truth: `source/src/renderer/src/styles/`
(`tokens.css` = tokens & primitives, `components.css` = shared components,
`pages.css` = page layouts, `animations.css` = keyframes/liquid motion).

---

## 1. Brand keywords & feel

**Glass · Rounded · Liquid · Modern · Soft · Premium.** Translucent frosted surfaces over an
ambient gradient mesh, generous radii, springy "liquid" motion, one saturated cobalt-blue
accent, everything soft-shadowed. Light and dark themes are equally first-class.

## 2. Color tokens (CSS custom properties)

### Accent (theme-independent, defined on `:root`)
| Token | Value | Usage |
|---|---|---|
| `--accent` | `#3f7dff` (cobalt blue) | Primary accent: active states, focus rings, selection, progress fills, links |
| `--accent-2` | `#29cfc0` (teal) | Secondary accent, only inside the liquid gradient |
| `--grad-liquid` | `linear-gradient(135deg, #3f7dff 0%, #29cfc0 100%)` | Primary buttons, active toggle switches, liquid pill fill |
| `--danger` | `#e5484d` | Destructive actions (delete/remove), error toasts |

Cobalt blue is used **sparingly and purposefully**: active nav pill, primary CTA, hearts/favorites,
active icons, focus-visible outlines, `::selection`. When in doubt, stay neutral and glassy.

### Light theme (`html[data-theme='light']`)
`--bg-0 #e9edf6` (base) · mesh blobs: blue `rgba(99,148,255,.20)`, teal `rgba(41,207,192,.16)`, violet `rgba(167,139,250,.14)` ·
text: `--text-1 #0e1220`, `--text-2 #454c63`, `--text-3 #858ca1` ·
glass: `--glass rgba(255,255,255,.55)`, `--glass-strong rgba(255,255,255,.78)`, `--glass-menu rgba(252,253,255,.86)`, border `--glass-border rgba(255,255,255,.66)`, inner highlight `--glass-inner rgba(255,255,255,.95)` ·
`--stroke rgba(14,18,32,.09)` · `--row-hover rgba(14,18,32,.05)` · `--row-active rgba(63,125,255,.10)` ·
shadows `--shadow-1` (soft ambient) / `--shadow-2` (elevated) / `--shadow-accent 0 10px 28px rgba(63,125,255,.32)` (glow under primary CTAs) ·
art placeholder `#dbe4f5→#c8d6ef` · scrollbar `rgba(14,18,32,.18)`.

### Dark theme (`html[data-theme='dark']`)
`--bg-0 #070b14` · mesh: `rgba(63,110,255,.13)` / `rgba(41,207,192,.09)` / `rgba(139,109,250,.10)` ·
text: `#eef2fb` / `#a7aec4` / `#676f86` ·
glass: `rgba(20,26,42,.55)` / strong `rgba(24,31,50,.82)` / menu `rgba(21,27,44,.92)`, border `rgba(255,255,255,.09)`, inner `rgba(255,255,255,.10)` ·
stroke `rgba(255,255,255,.09)` · row hover `rgba(255,255,255,.055)` · row active `rgba(63,125,255,.16)` ·
deeper/black shadows; art placeholder `#1b2338→#232d47`; scrollbar `rgba(255,255,255,.16)`.

### Ambient backdrop
`#app::before` = three fixed, blurred (`28px`) radial mesh blobs inset −20% (tokens
`--bg-mesh-1/2/3`) — the canvas behind every glass surface. Never put a solid page background over it.

### Dynamic Album-Art Theme
`--hero-accent` (default `#5b8cff`) is set at runtime on the Home hero from the current
cover's dominant color, computed **in the main process** (`art:palette` IPC; jpeg-js/pngjs
decode — no canvas). It tints the hero blobs (`color-mix` radial gradients), the Continue
Listening CTA gradient, and the now-playing eyebrow. Hero ambience slowly cycles hue via
`.hero-v0…v4` filter classes every 7 s.

## 3. Typography

- `--font-ui`: `'Segoe UI Variable Text', 'Segoe UI', system-ui, -apple-system, sans-serif` — body (14 px base).
- `--font-display`: `'Segoe UI Variable Display', 'Segoe UI', system-ui` — all headings (h1–h4), weight 600.
- No webfonts are bundled; the Windows system stack is intentional. Body text `--text-1`,
  secondary `--text-2`, meta/labels `--text-3`. Labels use 12 px uppercase +0.4 px tracking
  (`.field-label`).

## 4. Radius, blur, spacing, motion scales

- Radii: `--r-xs 8px` · `--r-s 12px` · `--r-m 16px` · `--r-l 22px` · `--r-xl 28px` · `--r-full 999px` (pills, icon buttons, primary buttons).
- Blur: `--blur-1 14px` (subtle) · `--blur-2 28px` (`.glass`) · `--blur-3 60px` (`.glass-strong`/overlays).
- Horizontal content padding: `--content-x 30px`.
- Motion: `--ease-liquid cubic-bezier(0.32, 0.94, 0.12, 1)` (the liquid snap),
  `--ease-out cubic-bezier(0.22, 1, 0.36, 1)`; durations `--dur-fast 160ms`,
  `--dur-page 260ms`, `--dur-liquid 520ms`.
- Theme cross-fade: `body.theme-anim *` transitions colors 420 ms (added for 480 ms on switch).
- Keyframes (`animations.css`): `pageIn` (page entrance), `fadeUp/fadeIn/overlayOut`,
  `sheetIn`/`sheetInCentered` (bottom sheets/profile), `nowPlayingIn`, `menuIn` (context menus),
  `dropIn` (drag overlay), `ripple`, `sheen`, `breathe` (now-playing artwork), `floaty`,
  `spin`, `eq1/eq2/eq3` (mini equalizer).

## 5. Core primitives

- **`.glass` / `.glass-strong`** — the two glass levels: translucent bg + `backdrop-filter: blur() saturate(1.5)` + 1 px `--glass-border` + outer shadow + inset top highlight. Menus use `--glass-menu` (more opaque for readability).
- **Buttons** (`.btn`): pill (`--r-full`), 40 px, glass bg; `.primary` = `--grad-liquid` + white text + `--shadow-accent` glow + inset highlight; `.danger` tints text `--danger`; press = `scale(0.965)`; `.subtle` = bare.
- **`.icon-btn`**: 36 px round; hover raises bg `--row-hover`; `.active` = accent on `--row-active`; press `scale(0.92)`.
- **`.chip`**: 34 px pill for history/tags; optional `.x` dismiss.
- **Fields** (`.field`): 40 px, `--r-s`, `--row-hover` bg, focus → accent border + glass bg.
- **`.switch`**: 42×24 pill; on = liquid gradient, knob slides with `--ease-liquid` 220 ms.

## 6. Navigation

- **Bottom NavBar** (fixed, glass): Home / Library / Stats / Search icon buttons; the active
  item is underlined by the **liquid pill** — a rounded `--grad-liquid` capsule that
  *travels* between tabs with squash-and-stretch (WAAPI in `NavBar.tsx`), re-anchoring on
  window resize/DPI change. The pill sits flush-left on the first tab.
- **Library segmented tabs** (`LiquidTabs.tsx`): same travelling-pill mechanic for
  Songs/Albums/Artists/Folders/Playlists/Favorites.
- **Context menus** (`ContextMenuHost`): glass-menu surface, `menuIn` scale 0.94 entrance,
  hover rows, danger rows in red, separators, icons; submenus flip right / clamp to viewport
  (animations suspended during measurement to avoid mis-clamping). Single implementation —
  shared builders in `actions.tsx`.

## 7. Cards, rows, hover behavior

- **Cards** (`Cards.tsx`, `components.css §cards`): rounded `--r-m` artwork tiles with hover
  lift (translateY + `--shadow-2`) and a hover three-dot menu button that anchors **inside
  the card** (cards must keep `position:relative`).
- **Song rows**: 44–52 px, art thumb, title/artist columns, hover reveals actions + heart +
  three-dot; `--row-hover` bg; `--row-active` tint while playing; selected (bulk) rows get
  `.selected` + check overlay.
- **Liquid progress**: seekbars are thin lines with a rounded gradient fill and a knob that
  scales in on hover; drag is smooth (no ticking).
- **Toasts**: bottom-center glass pills above the mini player; error toasts tinted `--danger`.
- **Dialogs**: centered glass-strong sheets (`sheetInCentered`), destructive OK = red.
- **Empty states**: soft illustration-free glass cards with a single CTA (e.g. "Add Files").

## 8. Mini player & Now Playing

- **Mini player**: fixed above the NavBar, glass-strong, album art + title/artist + play/pause
  + next + thin liquid progress line; expand → Now Playing.
- **Now Playing**: full-screen overlay (`nowPlayingIn`): blurred artwork layers as backdrop,
  breathing artwork (`breathe`), big transport controls centered, queue side panel with
  drag-reorder, shuffle/repeat accents, visualizer canvas.

## 9. Pages

- **Home** (current implementation, see CURRENT_STATE §5 pending revert request): greeting
  hero with ambient blobs + Continue Listening + shuffle CTA, mixed-size bands
  (feature tile + standard tiles), Heavy Rotation, Quick Picks, mood/genre cards
  (mood gradients defined in `lib/homeQueue.ts MOODS`).
- **Library**: liquid segmented tabs + lists/grids; bulk selection support.
- **Detail**: large header (art, name, meta) + track list.
- **Search**: morphing titlebar field, history chips, grouped results.
- **Statistics**: glass stat cards + daily bars.
- **Onboarding**: full-screen welcome → scan progress → ready (PlayPixBeam animation).

## 10. Accessibility & platform behavior

- `:focus-visible` = 2 px `--accent` outline, offset 2 px, radius 6 px — never remove.
- `user-select: none` on body (desktop app feel); inputs opt back in.
- Custom slim scrollbars (9 px, rounded, transparent track).
- Respect `prefers-color-scheme` for the `system` theme; smooth 420 ms cross-fade on switch.
- No reduced-motion media query block is currently shipped (keyframes are short and subtle);
  if adding heavy motion, guard it.
- Iconography: one inline-SVG stroke icon set (`Icon.tsx`) — no emoji, no icon fonts.
- Window: frameless, min 920×600, base 1280×840; page content scrolls inside `.viewport`.
