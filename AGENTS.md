# AGENTS.md — VideoDiary

Local-first, sci-fi themed video diary PWA. Records webcam entries with cinematic HUD overlays baked into the video via Canvas 2D compositing. No backend, no accounts — all data stays on-device.

## Tech Stack

- **SolidJS 1.9** — fine-grained reactivity, no VDOM. Components are functions that run once; only signals trigger updates.
- **Vite 6** with `vite-plugin-solid`, `@tailwindcss/vite` (v4), `vite-plugin-pwa`
- **TypeScript 5.7+** — strict mode, `noUnusedLocals`, `noUnusedParameters`
- **Tailwind CSS 4** — uses `@theme` directive in `src/styles/app.css`, no `tailwind.config.js`
- **No test framework** — no tests exist yet
- **No ESLint** — no linter configured

## Commands

```bash
npm run dev          # Vite dev server with HMR
npm run build        # Production build (target: esnext)
npm run preview      # Preview production build
npm run typecheck    # tsc --noEmit (the only CI-style check available)
```

Always run `npm run typecheck` after making changes. There are no tests to run.

## Path Alias

`~/` maps to `src/` everywhere. Configured in both `tsconfig.json` and `vite.config.ts`.

```typescript
import { diaryStore } from "~/stores/diary";  // = src/stores/diary.ts
```

## Architecture Overview

### Boot Sequence

1. `main.tsx` — Router with 3 routes: `/` (Record, eager), `/library` (lazy), `/settings` (lazy)
2. `App.tsx` — Checks `onboardingStore.isCompleted()` from localStorage
3. If not onboarded: shows `OnboardingWizard` (storage choice: OPFS / Filesystem / Ephemeral)
4. On complete: `initializeApp()` registers storage providers via factory pattern, sets active provider, wires `BroadcastChannel` cross-tab sync, loads all entries
5. Renders `AppShell` wrapping route children
6. `beforeunload` warns if ephemeral entries exist

### Recording Pipeline

```
Webcam MediaStream → hidden <video> → Canvas drawImage → template.render(ctx, frame)
→ canvas.captureStream(30fps) + audio tracks → MediaRecorder (WebM/VP9) → Blob chunks (1s intervals)
```

- `RecordingEngine` (`src/services/recorder/engine.ts`) orchestrates the entire pipeline
- Audio analysis: `AudioContext` + `AnalyserNode` (FFT 256) produces RMS level + frequency data passed to templates each frame
- Codec fallback chain: VP9+Opus → VP9 → VP8+Opus → VP8 → plain WebM
- `stop()` has a 5-second timeout safety net if `onstop` never fires

### Storage Architecture (3 providers)

All providers implement `IStorageProvider` (`src/services/storage/types.ts`). The `StorageManager` singleton (`src/services/storage/manager.ts`) manages them:

- **Reads** merge entries from ALL registered providers (unified library view)
- **Writes** go to the active provider only
- Each entry records its `storageProvider` field so updates/deletes route to the correct provider

| Provider | File | Persistence | Lazy Blobs | User-Visible Files |
|----------|------|-------------|------------|---------------------|
| `EphemeralStorage` | `src/services/storage/ephemeral.ts` | Session only (in-memory `Map`) | No | No |
| `OPFSStorage` | `src/services/storage/opfs.ts` | OPFS `/videodiary/{entries,videos}/` | Yes | No |
| `FilesystemStorage` | `src/services/storage/filesystem.ts` | User-picked OS folder | Yes | Yes |

**Provider registration**: Factory pattern in `src/services/storage/registry.ts`. Each factory has `isAvailable()` and `create()`. `src/services/init.ts` iterates factories and registers available ones.

**Write ordering rule**: Video blob first, metadata JSON last. This prevents orphan metadata if the write fails partway.

**Cross-tab sync**: `BroadcastChannel('videodiary-sync')` notifies other tabs on save/update/delete, triggering `diaryStore.loadEntries()`.

**FileSystemDirectoryHandle persistence**: Stored in IndexedDB via `src/services/storage/handle-store.ts`. On boot, the filesystem factory retrieves it and checks `queryPermission`/`requestPermission`.

### Template System

Templates are pure Canvas 2D render functions: `(ctx: CanvasRenderingContext2D, frame: TemplateFrame) => void`

- Registry: `src/components/templates/registry.ts` — array of `DiaryTemplate` objects, first entry is default
- Renderers: `src/components/templates/renderers/holographic.ts` (cyan/Avatar-style) and `military-hud.ts` (amber/Martian-style)
- `TemplateFrame` includes: dimensions, timestamp, elapsed, isRecording, title, audioLevel, audioFrequencyData

**To add a new template:**
1. Create `src/components/templates/renderers/my-template.ts` exporting `(ctx, frame) => void`
2. Add entry to the `templateRegistry` array in `src/components/templates/registry.ts`
3. The template automatically appears in `TemplatePicker`

## Key Patterns

### Store Pattern (Module-Level Singletons)

All stores use `createSignal` at module scope and export a plain object with getters + mutation methods. There are no SolidJS `createStore` or context providers.

```typescript
// src/stores/diary.ts — canonical example
const [entries, setEntries] = createSignal<DiaryEntry[]>([]);

export const diaryStore = {
  entries,                            // getter (signal accessor)
  async addEntry(entry: DiaryEntry) { // mutation
    await storageManager.save(entry);
    setEntries((prev) => [entry, ...prev]);
  },
};
```

Six stores: `diary`, `recorder`, `template`, `settings`, `onboarding`, `toast`.

### Async Work in createEffect (Critical Pattern)

SolidJS `createEffect` must be synchronous. Async work uses a non-returned IIFE with a cancellation flag:

```typescript
// src/components/library/DiaryDetail.tsx:32-76
createEffect(() => {
  const entry = props.entry;           // synchronous reactive read (tracked)
  // ...
  let cancelled = false;
  onCleanup(() => { cancelled = true; });

  void (async () => {
    const loaded = await storageManager.loadVideoBlob(entry);
    if (loaded && !cancelled) {
      setVideoUrl(URL.createObjectURL(loaded));
    }
  })();
});
```

### Never Access Reactive Props in onCleanup

Capture values eagerly before cleanup runs. The parent `<Show>` may tear down the component before `onCleanup` executes, making `props.entry` null:

```typescript
// src/components/library/DiaryDetail.tsx:26,111-117
let entryOwnBlobUrl: string | undefined;
// ...captured in createEffect...
onCleanup(() => {
  const url = videoUrl();
  if (url && url !== entryOwnBlobUrl) {  // safe: uses captured value, not props
    URL.revokeObjectURL(url);
  }
});
```

### Storage Provider Guard

All persistent providers call `assertInitialized()` at the top of every method to ensure `init()` was called:

```typescript
private assertInitialized(): void {
  if (!this.entriesDir || !this.videosDir) {
    throw new Error("OPFSStorage not initialized. Call init() first.");
  }
}
```

### Lazy Video Blob Loading

Persistent providers (OPFS, Filesystem) return `videoBlob: null` from `getAll()`. Blobs are loaded on-demand via `storageManager.loadVideoBlob(entry)` — only when the user opens an entry in `DiaryDetail`. Ephemeral keeps blobs in memory.

### Schema Evolution via deserializeMeta

`src/services/storage/types.ts` — `deserializeMeta()` provides defensive defaults for every field. When adding new fields to `DiaryEntry`/`DiaryEntryMeta`, add a default value here so existing stored entries don't break.

## Data Model

Core types in `src/models/types.ts`:

- `DiaryEntry` — full entry with `videoBlob: Blob | null` and `videoBlobUrl: string | null`
- `DiaryEntryMeta` — serializable subset (no Blob/URL fields), stored as JSON
- `StorageProviderType` — `'ephemeral' | 'opfs' | 'filesystem'`
- `TemplateFrame` — per-frame data passed to template renderers
- `DiaryTemplate` — template definition (id, name, render function, config)

**ID generation**: `crypto.randomUUID()` for ephemeral/OPFS, date-prefixed IDs for filesystem (`generateFilesystemId()` in `src/utils/id.ts` produces e.g. `2026-02-23_143207_a3f7`).

## Directory Structure

```
src/
├── main.tsx                              # Router setup, beforeunload guard
├── App.tsx                               # Onboarding gate, initializeApp(), AppShell wrapper
├── models/types.ts                       # All type definitions
├── types/file-system-access.d.ts         # Chrome File System Access API type declarations
├── styles/app.css                        # Tailwind v4 @theme tokens, custom animations
├── stores/
│   ├── diary.ts                          # Entry CRUD (delegates to storageManager)
│   ├── recorder.ts                       # Recording status, elapsed, stream, deviceId
│   ├── template.ts                       # Active template selection
│   ├── settings.ts                       # AppSettings (localStorage-persisted)
│   ├── onboarding.ts                     # OnboardingState (localStorage-persisted)
│   └── toast.ts                          # Toast notification queue
├── services/
│   ├── init.ts                           # initializeApp(), activateOPFS(), activateFilesystem()
│   ├── pwa.ts                            # PWA install prompt handler
│   ├── recorder/
│   │   ├── engine.ts                     # RecordingEngine (Canvas compositing + MediaRecorder)
│   │   ├── camera.ts                     # getUserMedia wrapper, device enumeration
│   │   └── types.ts                      # Re-exports
│   └── storage/
│       ├── types.ts                      # IStorageProvider, StorageCapabilities, deserializeMeta()
│       ├── manager.ts                    # StorageManager singleton (multi-provider, BroadcastChannel)
│       ├── ephemeral.ts                  # In-memory provider
│       ├── opfs.ts                       # OPFS provider + isOPFSAvailable(), getStorageQuota()
│       ├── filesystem.ts                 # File System Access API provider
│       ├── handle-store.ts              # IndexedDB for FileSystemDirectoryHandle persistence
│       └── registry.ts                   # ProviderFactory definitions
├── utils/
│   ├── id.ts                             # generateId() (UUID), generateFilesystemId()
│   ├── time.ts                           # formatDuration, formatDate, formatTime, generateAutoTitle
│   ├── video.ts                          # generateThumbnail, formatBlobSize, downloadBlob
│   ├── search.ts                         # searchEntries, filterByDate
│   └── compat.ts                         # checkBrowserCompat, getCameraErrorMessage
├── routes/
│   ├── Record.tsx                        # Thin wrapper for VideoRecorder
│   ├── Library.tsx                       # Search/filter + DiaryCard grid + DiaryDetail modal
│   └── Settings.tsx                      # Storage switching, recording settings, quota display
└── components/
    ├── layout/AppShell.tsx               # Dual nav (desktop top + mobile bottom), PWA install
    ├── recorder/
    │   ├── VideoRecorder.tsx             # Main recording orchestrator
    │   ├── RecordingControls.tsx         # Status-dependent buttons + timer
    │   └── PreviewPlayer.tsx             # Post-recording preview with metadata input
    ├── library/
    │   ├── DiaryCard.tsx                 # Entry card (thumbnail, badges)
    │   ├── DiaryDetail.tsx              # Modal with lazy video loading, focus trap
    │   └── DiarySearch.tsx              # Search input + date filter pills
    ├── onboarding/
    │   ├── OnboardingWizard.tsx          # 2-step wizard container
    │   ├── WelcomeStep.tsx              # Welcome splash
    │   └── StorageStep.tsx              # Storage choice with folder picker
    ├── templates/
    │   ├── registry.ts                   # Template definitions array
    │   ├── types.ts                      # Re-exports
    │   ├── TemplatePicker.tsx            # Template selection buttons
    │   └── renderers/
    │       ├── holographic.ts            # Avatar-style cyan HUD (~493 lines)
    │       └── military-hud.ts           # Martian-style amber HUD (~568 lines)
    └── ui/
        ├── Button.tsx                    # Variant/size button using splitProps
        ├── Toast.tsx                     # Toast notification container
        ├── ErrorBoundary.tsx             # Error boundary with retry/reload
        └── CompatBanner.tsx             # Browser compatibility warnings
```

## Styling

- Tailwind v4 with custom `@theme` tokens in `src/styles/app.css` (colors, fonts)
- Dark theme: `#0a0a0f` background, `#00ffff` cyan accent, `#e0e0e8` text
- Fonts: Inter (body), JetBrains Mono (monospace), Orbitron (display/headings) — loaded from Google Fonts in `index.html`
- Custom animations defined via `@keyframes` in `app.css`: `pulse-rec`, `glow-breathe`, `toast-in`, `fade-in`, `scale-in`, `slide-up-in`, `card-glow`
- Safe area padding for notched phones (`env(safe-area-inset-*)`)

## Browser API Dependencies

This app relies heavily on modern browser APIs. Most have no polyfill:

- `MediaRecorder` + `captureStream` — video recording
- `Canvas 2D` — overlay compositing
- `AudioContext` + `AnalyserNode` — real-time audio analysis for templates
- `Origin Private File System` (`navigator.storage.getDirectory()`) — OPFS storage
- `File System Access API` (`showDirectoryPicker`) — filesystem storage (Chrome/Edge only)
- `BroadcastChannel` — cross-tab sync
- `IndexedDB` — persisting `FileSystemDirectoryHandle`
- `crypto.randomUUID()` — ID generation
- Service Worker / PWA — offline support

`src/utils/compat.ts` checks 5 features at runtime; `CompatBanner` shows warnings for missing ones.
