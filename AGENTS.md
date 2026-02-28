# AGENTS.md — VidLog

Local-first, sci-fi themed video diary PWA. Records webcam entries with cinematic HUD overlays baked into the video via Canvas 2D compositing. All data stays on-device by default; optional Google Drive cloud sync (pure client-side OAuth, no backend) lets users back up and stream entries across devices.

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
5. Starts filesystem observer (polls for external changes to the user-picked folder)
6. Non-blocking `initializeCloud()` attempts to restore a previous Google Drive session (always returns false for GIS implicit flow — user must re-sign-in each session)
7. Renders `AppShell` wrapping route children
8. `beforeunload` warns if ephemeral entries exist

### Recording Pipeline

```
Webcam MediaStream → hidden <video> → Canvas drawImage → template.render(ctx, frame)
→ canvas.captureStream(fps) + audio tracks → MediaRecorder → Blob chunks (1s intervals)
```

- `RecordingEngine` (`src/services/recorder/engine.ts`) orchestrates the entire pipeline
- Audio analysis: `AudioContext` + `AnalyserNode` (FFT 256) produces RMS level + frequency data passed to templates each frame
- `stop()` has a 5-second timeout safety net if `onstop` never fires

**Recording Profiles** (`src/services/recorder/profiles.ts`):
| Profile | FPS | Audio Bitrate | Video Bitrate Multiplier |
|---------|-----|---------------|--------------------------|
| `standard` | 30 | browser default (~128kbps) | 1.0x |
| `efficient` | 24 | 32kbps | 0.6x |

`resolveRecordingParams(profile, quality)` combines a profile with a quality preset (`low`/`medium`/`high`) to produce final engine parameters.

**Recording Formats & Codec Fallback Chains** (`RecordingEngine.CODEC_CHAINS`):
| Format | Primary chain | Fallback |
|--------|---------------|----------|
| `av1` | MP4 AV1+Opus → MP4 AV1+AAC → MP4 AV1 | WebM VP9+Opus → WebM |
| `h264` | MP4 H.264+Opus → MP4 H.264+AAC → MP4 | WebM VP9+Opus → WebM |
| `webm` | WebM VP9+Opus → VP9 → VP8+Opus → VP8 | WebM |

The engine calls `MediaRecorder.isTypeSupported()` to walk the chain. The negotiated MIME type is stored on the entry (`mimeType` field).

### Storage Architecture (3 providers)

All providers implement `IStorageProvider` (`src/services/storage/types.ts`). The `StorageManager` singleton (`src/services/storage/manager.ts`) manages them:

- **Reads** merge entries from ALL registered providers (unified library view)
- **Writes** go to the active provider only
- Each entry records its `storageProvider` field so updates/deletes route to the correct provider

| Provider | File | Persistence | Lazy Blobs | User-Visible Files |
|----------|------|-------------|------------|---------------------|
| `EphemeralStorage` | `src/services/storage/ephemeral.ts` | Session only (in-memory `Map`) | No | No |
| `OPFSStorage` | `src/services/storage/opfs.ts` | OPFS `/vidlog/{entries,videos}/` | Yes | No |
| `FilesystemStorage` | `src/services/storage/filesystem.ts` | User-picked OS folder | Yes | Yes |

**Provider registration**: Factory pattern in `src/services/storage/registry.ts`. Each factory has `isAvailable()` and `create()`. `src/services/init.ts` iterates factories and registers available ones.

**Write ordering rule**: Video blob first, metadata JSON last. This prevents orphan metadata if the write fails partway.

**Cross-tab sync**: `BroadcastChannel('vidlog-sync')` notifies other tabs on save/update/delete, triggering `diaryStore.loadEntries()`.

**FileSystemDirectoryHandle persistence**: Stored in IndexedDB via `src/services/storage/handle-store.ts`. On boot, the filesystem factory retrieves it and checks `queryPermission`/`requestPermission`.

### Cloud Sync Architecture

Cloud sync is a **separate layer** from the storage system — `ICloudProvider` does not extend `IStorageProvider`. Cloud providers handle upload/download/metadata operations against a remote backend; they don't participate in `StorageManager`'s read/write flow.

**Google Drive implementation** (the only cloud provider):
- Uses **Google Identity Services (GIS) Token Model** (implicit flow) — no refresh tokens, no backend. User re-signs-in each session via popup.
- Client ID resolved from: (1) localStorage override (`vidlog-google-client-id`), (2) `VITE_GOOGLE_CLIENT_ID` env var.
- Files stored in Drive's **`appDataFolder`** (hidden, `drive.appdata` scope — non-sensitive, no broad Drive access).
- Flat file naming: `video_{entryId}.{ext}` and `entry_{entryId}.json` with `appProperties` for filtering.
- Video upload uses Drive's **resumable upload** protocol for reliability.

**Sync behavior by storage mode:**
| Storage Mode | Sync Behavior |
|-------------|---------------|
| OPFS | Auto-sync after save (if connected + enabled), manual toggle in Settings |
| Ephemeral | "Upload to Drive" button in PreviewPlayer only (one-shot upload) |
| Filesystem | No cloud sync — info message in Settings |

**Cloud-only entries** — When `fetchCloudEntries()` discovers entries in Drive that don't exist locally, it saves metadata-only records to OPFS (with `cloudSync.status = 'cloud-only'`, no video blob). These appear in the library with a cloud badge. Playback streams directly from Drive via `getVideoStreamUrl()`.

**Sync queue** (`CloudSyncManager` in `src/services/cloud/manager.ts`):
- Persisted in localStorage (`vidlog-sync-queue`)
- Processes sequentially (one upload at a time)
- Exponential backoff on failures, max 3 retries
- Detects quota-exceeded (403) and auth-revoked (401) errors with specific behavior
- `BroadcastChannel('vidlog-cloud-sync')` notifies other tabs of sync events

**Key files:**
| File | Purpose |
|------|---------|
| `src/services/cloud/types.ts` | `ICloudProvider` interface, `CloudFileRef`, `SyncQueueItem`, `UploadProgress` |
| `src/services/cloud/google-drive.ts` | Google Drive `ICloudProvider` implementation (~492 lines) |
| `src/services/cloud/auth/google.ts` | GIS token model, OAuth popup, email fetch (~315 lines) |
| `src/services/cloud/manager.ts` | `CloudSyncManager` singleton — queue, sync, upload, delete (~490 lines) |
| `src/stores/cloud.ts` | Reactive store for cloud connection state, auto-sync toggle (~188 lines) |

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

Seven stores: `diary`, `recorder`, `template`, `settings`, `onboarding`, `toast`, `cloud`.

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
- `RecordingProfile` — `'standard' | 'efficient'`
- `RecordingFormat` — `'av1' | 'h264' | 'webm'`
- `CloudProviderType` — `'google-drive'`
- `CloudSyncEntryStatus` — `'pending' | 'uploading' | 'synced' | 'cloud-only' | 'failed'`
- `CloudFileRef` — reference to a file in a cloud provider (`{ provider, fileId, mimeType }`)
- `CloudSyncInfo` — cloud sync metadata on an entry (`{ provider, videoFileRef, metaFileRef, syncedAt, status, lastError? }`)
- `AppSettings` — includes `recordingProfile`, `recordingFormat`, `cloudAutoSync`

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
│   ├── toast.ts                          # Toast notification queue
│   └── cloud.ts                          # Cloud connection state, auto-sync toggle
├── services/
│   ├── init.ts                           # initializeApp(), activateOPFS(), activateFilesystem()
│   ├── pwa.ts                            # PWA install prompt handler
│   ├── recorder/
│   │   ├── engine.ts                     # RecordingEngine (Canvas compositing + MediaRecorder)
│   │   ├── camera.ts                     # getUserMedia wrapper, device enumeration
│   │   ├── profiles.ts                   # Recording profiles (standard/efficient), resolveRecordingParams()
│   │   └── types.ts                      # Re-exports
│   ├── storage/
│   │   ├── types.ts                      # IStorageProvider, StorageCapabilities, deserializeMeta()
│   │   ├── manager.ts                    # StorageManager singleton (multi-provider, BroadcastChannel)
│   │   ├── ephemeral.ts                  # In-memory provider
│   │   ├── opfs.ts                       # OPFS provider + isOPFSAvailable(), getStorageQuota()
│   │   ├── filesystem.ts                 # File System Access API provider
│   │   ├── handle-store.ts              # IndexedDB for FileSystemDirectoryHandle persistence
│   │   └── registry.ts                   # ProviderFactory definitions
│   └── cloud/
│       ├── types.ts                      # ICloudProvider interface, CloudFileRef, SyncQueueItem
│       ├── google-drive.ts               # Google Drive ICloudProvider (resumable upload, appDataFolder)
│       ├── manager.ts                    # CloudSyncManager singleton (queue, sync, upload, delete)
│       └── auth/
│           └── google.ts                 # GIS token model, OAuth popup, email fetch
├── utils/
│   ├── id.ts                             # generateId() (UUID), generateFilesystemId()
│   ├── time.ts                           # formatDuration, formatDate, formatTime, generateAutoTitle
│   ├── video.ts                          # generateThumbnail, formatBlobSize, downloadBlob
│   ├── format.ts                         # formatBytes, getExtensionForMimeType
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
        ├── CompatBanner.tsx             # Browser compatibility warnings
        ├── StorageBadge.tsx             # Storage provider indicator badge
        └── StorageRecoveryBanner.tsx    # Storage fallback recovery prompt
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
- `Google Identity Services (GIS)` — loaded from `accounts.google.com/gsi/client` CDN for OAuth
- `Google Drive REST API v3` — file upload/download/list via `www.googleapis.com/drive/v3`

`src/utils/compat.ts` checks 5 features at runtime; `CompatBanner` shows warnings for missing ones.
