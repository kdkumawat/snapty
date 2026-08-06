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
bun run build
bun start
```

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
│   ├── api/import-url/route.ts   # Image URL proxy API
│   ├── globals.css                # Global styles + theme variables
│   ├── layout.tsx                 # Root layout with SEO metadata + PWA
│   └── page.tsx                   # Entry point
├── components/
│   ├── editor/
│   │   ├── editor-canvas.tsx      # Konva canvas (main editing area)
│   │   ├── editor-page.tsx        # Landing page + docs + editor shell
│   │   ├── export-dialog.tsx      # Export dialog with canvas style support
│   │   ├── help-dialog.tsx        # Keyboard shortcuts reference
│   │   ├── properties-panel.tsx   # Right panel (colors, sizes, canvas style)
│   │   ├── toolbar.tsx            # Left tool sidebar
│   │   ├── top-bar.tsx            # Top bar (undo/redo/zoom/reset/export)
│   │   └── welcome-screen.tsx     # Image upload/paste/drag-drop
│   ├── scissor-logo.tsx           # Shared scissors SVG icon
│   ├── json-ld.tsx                # Structured data for SEO
│   └── ui/                        # shadcn/ui components
├── hooks/
│   └── use-keyboard-shortcuts.ts  # Keyboard shortcuts + clipboard paste
├── store/
│   └── editor-store.ts            # Zustand store (all editor state)
└── types/
    └── editor.ts                  # TypeScript types
public/
├── manifest.json                  # PWA manifest
├── sw.js                          # Service worker (offline + cache)
├── favicon.svg                    # App icon
└── _headers                       # Cloudflare Pages headers
```

## License

MIT
