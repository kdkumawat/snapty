# Snapty

Browser-native screenshot editor. Annotate, style, and export - all in your browser.

## Features

- **15+ Tools** - Arrow, shapes, pencil, highlighter, text, step numbers, blur, pixelate, spotlight, eraser
- **Canvas Styling** - Padding, border radius, shadows, backgrounds (solid/gradient/glass), device frames
- **Export** - PNG, JPG, WEBP with quality control. Copy to clipboard instantly.
- **Privacy** - All processing is local. No data leaves your browser.
- **Themes** - Light, dark, and system
- **Keyboard First** - Full shortcut support (V, H, A, R, O, P, T, N, B, X, S, E, etc.)
- **PWA** - Install as a browser app for quick access
- **Screen Capture Ready** - Works seamlessly with macOS Cmd+Ctrl+Shift+4 and Windows Win+Shift+S

## Tech Stack

| Technology | Purpose |
|---|---|
| **Next.js 16** | React framework with App Router |
| **React 19** | UI library |
| **TypeScript 5** | Type safety |
| **Konva.js** (react-konva) | HTML5 Canvas for image editing |
| **Zustand** | Client state management |
| **Tailwind CSS v4** | Utility-first styling |
| **shadcn/ui** | UI component library |
| **Lucide** | Icon library |
| **next-themes** | Light/dark/system theme support |
| **Service Worker** | Offline support + PWA capabilities |

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) (recommended) or Node.js 20+

### Install

```bash
git clone <your-repo-url>
cd Snapty
bun install
```

### Run

```bash
bun dev
```

The app opens at `http://localhost:3001`.

### Production Build

```bash
bun run build   # static export to out/
```

Deploy to Cloudflare Pages with `bun run cf:deploy` (see [DEPLOYMENT.md](./DEPLOYMENT.md)).

## Direct Editor Link

Bookmark `https://snapty.pages.dev/#editor` to go directly to the editor, skipping the landing page.

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment guides.

## Screen Capture Integration

Snapty works seamlessly with your OS screen capture tools:

- **macOS**: `Cmd+Ctrl+Shift+4` captures a region to clipboard. Then paste into Snapty with `Cmd+V`.
- **Windows**: `Win+Shift+S` captures a region to clipboard. Then paste into Snapty with `Ctrl+V`.
- **Browser Extension**: Use extensions like GoFullPage or FireShot for full-page captures.
- **PWA**: Install Snapty as a browser app (Chrome/Edge: click install icon in address bar). On macOS, it appears in the dock for quick access.

## Project Structure

```
src/
├── app/
│   ├── page.tsx                   # Landing page (/)
│   ├── editor/page.tsx            # Editor route (/editor)
│   ├── guide|info|privacy/        # Static content routes
│   ├── globals.css                # Global styles + theme variables (Tailwind v4 CSS-first config)
│   └── layout.tsx                 # Root layout with SEO metadata + PWA
├── components/
│   ├── landing/                   # Marketing surface (owns /)
│   ├── editor/                    # Editor UI, organized into subdirs
│   │   ├── canvas/                # Konva canvas layers & shape rendering
│   │   ├── chrome/                # Top bar / frame chrome
│   │   ├── dialogs/               # Export, help, etc.
│   │   ├── menus/                 # Context menus, command palette
│   │   ├── panels/                # Properties/settings panels
│   │   ├── toolbar/               # Left tool sidebar
│   │   └── shell/                 # Page shell wiring everything together
│   └── ui/                        # shadcn/ui components
├── hooks/
│   └── use-keyboard-shortcuts.ts  # Keyboard shortcuts + clipboard paste
├── lib/editor/                    # Annotation geometry/rendering helpers
├── store/
│   └── editor-store.ts            # Zustand store (all editor state)
└── types/
    └── editor.ts                  # TypeScript types
public/
├── manifest.json                  # PWA manifest
├── sw.js                          # Service worker (offline + cache)
└── _headers                       # Cloudflare Pages headers
```

## License

MIT

