# VideoDiary

**Obsidian for Video Journals.** A local-first, sci-fi themed video diary PWA. Record webcam entries with cinematic HUD overlays baked into the video — no backend, no accounts, your data stays on your device.

Inspired by the holographic interfaces from *Avatar* and the NASA HUD from *The Martian*.

---

## What It Does

- **Record** webcam video with real-time sci-fi overlays composited directly into the output
- **Choose templates** — Holographic (Avatar-style cyan panels) or Military HUD (Martian-style amber readouts)
- **Persist locally** — recordings saved to your browser's Origin Private File System (OPFS), surviving page refreshes and browser restarts
- **Browse & search** — library view with thumbnails, tags, date filters, and full video playback
- **Install as PWA** — works offline, installable to home screen
- **Download** any entry as a `.webm` file

No servers. No sign-ups. No tracking. Everything runs in your browser.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [SolidJS](https://www.solidjs.com/) — fine-grained reactivity, no virtual DOM |
| Build | [Vite](https://vite.dev/) 6 |
| Language | TypeScript (strict) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) 4 |
| Routing | [@solidjs/router](https://github.com/solidjs/solid-router) |
| PWA | [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) |
| Video | Native MediaRecorder + Canvas 2D compositing |
| Storage | OPFS (Origin Private File System) — purpose-built for large file I/O |

## Prerequisites

- **Node.js** >= 18
- **npm** >= 9
- **Chrome or Edge** (Chromium-based browser required — MediaRecorder + OPFS + captureStream support)

## Getting Started

```bash
# Clone the repo
git clone https://github.com/<your-username>/VideoDiary.git
cd VideoDiary

# Install dependencies
npm install

# Start development server
npm run dev
```

Open `http://localhost:5173` in Chrome/Edge. Grant camera + microphone permissions when prompted.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run typecheck` | Run TypeScript type checking (no emit) |

## Self-Hosting

VideoDiary is a static site — the build output is plain HTML/CSS/JS with a service worker. No server-side runtime needed.

```bash
# Build for production
npm run build

# Output is in dist/
ls dist/
```

Deploy the `dist/` directory to any static hosting:

- **Nginx / Apache** — serve `dist/` as the document root. Add a fallback to `index.html` for client-side routing:
  ```nginx
  location / {
      try_files $uri $uri/ /index.html;
  }
  ```
- **Vercel / Netlify / Cloudflare Pages** — point to the repo, set build command to `npm run build` and output directory to `dist`
- **GitHub Pages** — push `dist/` to a `gh-pages` branch or use a GitHub Action
- **Docker** — serve with any static file server:
  ```dockerfile
  FROM nginx:alpine
  COPY dist/ /usr/share/nginx/html/
  # Add SPA fallback
  RUN echo 'server { listen 80; root /usr/share/nginx/html; location / { try_files $uri /index.html; } }' > /etc/nginx/conf.d/default.conf
  EXPOSE 80
  ```

> **Important**: OPFS and service workers require HTTPS in production (localhost is exempt during development). Make sure your hosting serves over HTTPS.

## Architecture Overview

```
Camera (getUserMedia)
  |
  v
requestAnimationFrame loop:
  |-- drawImage(webcam)          # Draw webcam frame to canvas
  |-- template.render(ctx)       # Draw sci-fi overlay on top
  v
canvas.captureStream(30fps)      # Capture composited output
  |
  v
MediaRecorder (WebM/VP9)         # Record to blob chunks
  |
  v
OPFS / In-Memory                 # Persist locally
```

The overlays aren't CSS layers — they're baked into the video pixels via Canvas 2D compositing, so they appear in the downloaded file.

## Project Structure

```
src/
├── routes/                 # Page components (Record, Library, Settings)
├── components/
│   ├── recorder/           # VideoRecorder, RecordingControls, PreviewPlayer
│   ├── library/            # DiaryGrid, DiaryCard, DiarySearch, DiaryDetail
│   ├── templates/          # TemplatePicker, renderers (holographic, military-hud)
│   ├── onboarding/         # First-run wizard
│   ├── layout/             # AppShell, navigation
│   └── ui/                 # Button, Toast, ErrorBoundary, CompatBanner
├── services/
│   ├── recorder/           # Recording engine, camera access
│   └── storage/            # OPFS provider, ephemeral provider, storage manager
├── stores/                 # SolidJS reactive state (diary, recorder, settings, etc.)
├── utils/                  # Time formatting, video thumbnails, search, IDs
└── styles/                 # Tailwind config + custom animations
```

See [`PLAN.md`](./PLAN.md) for the full architecture spec, data models, and phased roadmap.

## Storage Model

VideoDiary is **local-first**. Recordings are stored in the browser's [Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) — a high-performance, origin-scoped filesystem designed for large files. This means:

- Your videos never leave your device unless you explicitly download them
- Data persists across sessions (unlike IndexedDB, OPFS handles large files well)
- `navigator.storage.persist()` is called to prevent browser eviction
- Storage quota is visible in Settings with usage warnings at 80%

An in-memory (ephemeral) mode is also available for quick tryouts — recordings exist only while the tab is open.

## Roadmap

- [x] Core recording, templates, storage, library, PWA
- [ ] Cloud sync (Google Drive) — optional backup, local stays primary
- [ ] Streaming writes to OPFS, hybrid cloud eviction, FFmpeg.wasm, transcription, custom templates

See the full roadmap in [`PLAN.md`](./PLAN.md).

## Browser Support

| Browser | Support |
|---------|---------|
| Chrome 90+ | Full |
| Edge 90+ | Full |
| Firefox | Partial (different codecs, no OPFS `entries()`) |
| Safari | Limited (MediaRecorder quirks, OPFS limitations) |

**Chrome/Edge is the target.** The app shows a compatibility banner if required APIs are missing.

## License

MIT

---

Built with [SolidJS](https://www.solidjs.com/) + [Vite](https://vite.dev/) + [Tailwind CSS](https://tailwindcss.com/).
