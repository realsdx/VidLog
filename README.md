# VidLog

**Obsidian for Video Journals.** A local-first, sci-fi themed video diary PWA. Record webcam entries with cinematic HUD overlays baked into the video — no backend, no accounts, your data stays on your device.

Inspired by the holographic interfaces from *Avatar* and the NASA HUD from *The Martian*.

> Note: Just me vibecoding a mildly useful app. For me first, maybe you too.
---

## What It Does

- **Record** webcam video with real-time sci-fi overlays composited directly into the output
- **Choose templates** — Holographic (Avatar-style cyan panels) or Military HUD (Martian-style amber readouts)
- **Persist locally** — three storage options: browser OPFS, a user-picked filesystem folder (syncs with Dropbox/backup tools), or ephemeral (in-memory)
- **Browse & search** — unified library across all storage providers, with thumbnails, tags, date filters, and full video playback
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
| Storage | OPFS, File System Access API, or ephemeral (in-memory) |

## Prerequisites

- **Node.js** >= 18
- **npm** >= 9
- **Chrome or Edge** (Chromium-based browser required — MediaRecorder + OPFS + captureStream support)

## Getting Started

```bash
# Clone the repo
git clone https://github.com/<your-username>/VidLog.git
cd VidLog

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

VidLog is a static site — the build output is plain HTML/CSS/JS with a service worker. No server-side runtime needed.

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

> **Important**: OPFS, the File System Access API, and service workers require HTTPS in production (localhost is exempt during development). Make sure your hosting serves over HTTPS.

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
OPFS / Filesystem / In-Memory     # Persist locally
```

The overlays aren't CSS layers — they're baked into the video pixels via Canvas 2D compositing, so they appear in the downloaded file.


## Storage Model

VidLog is **local-first**. All data stays on your device — you choose where during onboarding:

| Provider | Persistence | Files visible in OS | Browser support |
|----------|-------------|---------------------|-----------------|
| **OPFS** (default) | Survives refresh & restart | No (origin-scoped) | Chrome, Edge, Firefox |
| **Filesystem Folder** | User-picked OS folder | Yes — syncable via Dropbox, etc. | Chrome, Edge only |
| **Ephemeral** | Tab lifetime only | No (in-memory) | All |

You can switch providers at any time in Settings. Existing entries remain accessible from their original provider.

## Browser Support

| Browser | Support |
|---------|---------|
| Chrome 90+ | Full (all 3 storage providers) |
| Edge 90+ | Full (all 3 storage providers) |
| Firefox | Partial (OPFS + ephemeral only, different codecs, no File System Access API) |
| Safari | Limited (MediaRecorder quirks, no filesystem provider, OPFS limitations) |

**Chrome/Edge is the target.** Filesystem folder storage requires the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API) (Chromium only). The app shows a compatibility banner if required APIs are missing.

## License

MIT

---

Built with [SolidJS](https://www.solidjs.com/) + [Vite](https://vite.dev/) + [Tailwind CSS](https://tailwindcss.com/).
