# Contributing to PlayPix

Thank you for your interest in contributing to PlayPix! We welcome issues, bug reports, feature discussions, and pull requests.

## Architecture Principles

1. **Local-First & Privacy First**: PlayPix is an offline desktop sanctuary. We never introduce telemetry, cloud tracking, mandatory online logins, or intrusive analytics.
2. **Deterministic UI State**: The renderer communicates strictly with the main process through typed IPC contracts defined in `src/shared/types.ts`.
3. **Audio Integrity**: Original audio files are treated with total reverence. Never modify, rename, or write back audio metadata without explicit user confirmation and automated file backups.
4. **Performance**: All library scans and heavy operations run in dedicated background worker threads to keep the UI buttery smooth at 60 FPS.

## Development Setup

### Prerequisites
- Node.js (v20+ recommended)
- npm (v9+)
- Windows 10/11 (or Linux/macOS with Xvfb for headless development)
- Python & build tools (for native `better-sqlite3` bindings)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/playpix.git
cd playpix

# Install dependencies
npm install

# Rebuild native modules against Electron
npm run rebuild

# Run development server
npm run dev
```

### Useful Scripts

- `npm run typecheck`: Validates TypeScript strict mode across main, preload, and renderer.
- `npm run build`: Bundles main, preload, and renderer for production.
- `npm run seed`: Generates an isolated test music collection in `./test-music`.
- `npm run e2e`: Executes the comprehensive automated E2E test suite.

## Submitting Pull Requests

1. Fork the repository and create a feature branch (`git checkout -b feat/amazing-feature`).
2. Verify that typechecks pass: `npm run typecheck`.
3. Ensure formatting and styling conventions adhere to the project standards.
4. Commit your changes with clear, semantic commit messages:
   - `feat: add new feature`
   - `fix: resolve bug in playback engine`
   - `docs: update documentation`
5. Open a Pull Request against the `main` branch with a clear description of your changes.
