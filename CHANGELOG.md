# Changelog

All notable changes to **PlayPix** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.0] - 2026-10-08

### Added
- **Floating Glass Dock:** Transformed bottom navigation into a floating glass capsule dock with `backdrop-blur-xl`, suspended above the music bar with dynamic elevation.
- **Full-Width Listening Statistics:** Redesigned the Statistics page to expand to 100% viewport width, eliminating empty margins and balancing the 14-day activity chart, most played tracks, and top artists.
- **Top Metrics 5-Column Alignment:** Arranged Last Played (with cover art), Listening Time, Tracks Played, and Favorites into a balanced single-row grid.
- **Dynamic Album Art Theme:** Real-time extraction of dominant color palettes from album covers, generating ambient radial gradients across the interface.
- **Windows Mini Player:** Dedicated 270×270 frameless desktop mini-player card with always-on-top toggle and full playback transport controls.
- **Official Brand Book & Visual Identity:** Published the complete 31-page agency design system document (`docs/PlayPix-Official-Brand-Book.pdf`).

### Changed
- Refined navigation z-index layering to ensure the floating dock never collides with transport controls or modal dialogs.
- Optimized worker-thread metadata parser for high-density FLAC and ALAC audio collections.

### Fixed
- Fixed Statistics page right margin issue where container was artificially constrained to 1060px.
- Corrected vertical scrollbar anchoring on wide desktop screens.

---

## [1.1.0] - 2026-10-05

### Added
- Circular Audio Visualizer radiating outward from album artwork in Now Playing screen.
- Smart Playlists (Most Played, Recently Played, Recently Added, Favorites) with 4-cover mosaic collages.
- Bulk song selection with floating action bar (Play, Queue, Favorite, Remove).
- Native Windows media keys (Play/Pause, Next, Previous) and System Media Transport Controls (SMTC).

---

## [1.0.0] - 2026-09-28

### Added
- Initial public release of PlayPix for Windows 10 & 11.
- Embedded SQLite engine with WAL journaling for zero-latency local library indexing.
- Multi-threaded recursive local file scanner with automatic duplicate detection.
- As-you-type instant search across songs, artists, albums, and playlists.
- Zero-telemetry offline architecture: 100% private and on-device.
