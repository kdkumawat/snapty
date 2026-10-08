import React from 'react';

/**
 * The editor's icon set outside the toolbar and panel glyphs that come
 * straight from Excalidraw: Tabler outline icons (MIT), the same family
 * Excalidraw draws on, so every icon in the editor shares one stroke style.
 *
 * Exports keep lucide's names and props (className, strokeWidth), so a file
 * switches icon set by changing only its import path. Generated from the
 * Tabler SVG sources.
 */

type IconProps = React.SVGProps<SVGSVGElement>;

const icon = (children: React.ReactNode) => {
  const Icon = ({ strokeWidth = 1.5, ...props }: IconProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
  return Icon;
};

export const Copy = icon(<><path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666" /><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" /></>); // tabler: copy
export const Check = icon(<><path d="M5 12l5 5l10 -10" /></>); // tabler: check
export const Download = icon(<><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><path d="M7 11l5 5l5 -5" /><path d="M12 4l0 12" /></>); // tabler: download
export const Share2 = icon(<><path d="M3 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /><path d="M15 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /><path d="M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /><path d="M8.7 10.7l6.6 -3.4" /><path d="M8.7 13.3l6.6 3.4" /></>); // tabler: share
export const Loader2 = icon(<><path d="M12 3a9 9 0 1 0 9 9" /></>); // tabler: loader-2
export const ChevronDown = icon(<><path d="M6 9l6 6l6 -6" /></>); // tabler: chevron-down
export const ChevronRight = icon(<><path d="M9 6l6 6l-6 6" /></>); // tabler: chevron-right
export const MonitorUp = icon(<><path d="M21 12v3a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-10a1 1 0 0 1 1 -1h9" /><path d="M7 20l10 0" /><path d="M9 16l0 4" /><path d="M15 16l0 4" /><path d="M17 4h4v4" /><path d="M16 9l5 -5" /></>); // tabler: screen-share
export const X = icon(<><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></>); // tabler: x
export const ZoomIn = icon(<><path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M7 10l6 0" /><path d="M10 7l0 6" /><path d="M21 21l-6 -6" /></>); // tabler: zoom-in
export const ZoomOut = icon(<><path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M7 10l6 0" /><path d="M21 21l-6 -6" /></>); // tabler: zoom-out
export const Undo2 = icon(<><path d="M9 14l-4 -4l4 -4" /><path d="M5 10h11a4 4 0 1 1 0 8h-1" /></>); // tabler: arrow-back-up
export const Redo2 = icon(<><path d="M15 14l4 -4l-4 -4" /><path d="M19 10h-11a4 4 0 1 0 0 8h1" /></>); // tabler: arrow-forward-up
export const Scissors = icon(<><path d="M3 7a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /><path d="M3 17a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /><path d="M8.6 8.6l10.4 10.4" /><path d="M8.6 15.4l10.4 -10.4" /></>); // tabler: scissors
export const ShieldCheck = icon(<><path d="M11.46 20.846a12 12 0 0 1 -7.96 -14.846a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 -.09 7.06" /><path d="M15 19l2 2l4 -4" /></>); // tabler: shield-check
export const Sparkles = icon(<><path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6" /></>); // tabler: sparkles
export const Github = icon(<><path d="M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5" /></>); // tabler: brand-github
export const BookOpen = icon(<><path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0" /><path d="M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0" /><path d="M3 6l0 13" /><path d="M12 6l0 13" /><path d="M21 6l0 13" /></>); // tabler: book
export const FolderOpen = icon(<><path d="M5 19l2.757 -7.351a1 1 0 0 1 .936 -.649h12.307a1 1 0 0 1 .986 1.164l-.996 5.211a2 2 0 0 1 -1.964 1.625h-14.026a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2h4l3 3h7a2 2 0 0 1 2 2v2" /></>); // tabler: folder-open
export const Clipboard = icon(<><path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" /><path d="M9 5a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2" /></>); // tabler: clipboard
export const Link = icon(<><path d="M9 15l6 -6" /><path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464" /><path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463" /></>); // tabler: link
export const HelpCircle = icon(<><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 16v.01" /><path d="M12 13a2 2 0 0 0 .914 -3.782a1.98 1.98 0 0 0 -2.414 .483" /></>); // tabler: help-circle
export const Info = icon(<><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 9h.01" /><path d="M11 12h1v4h1" /></>); // tabler: info-circle
export const Play = icon(<><path d="M7 4v16l13 -8l-13 -8" /></>); // tabler: player-play
export const Keyboard = icon(<><path d="M2 8a2 2 0 0 1 2 -2h16a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2l0 -8" /><path d="M6 10l0 .01" /><path d="M10 10l0 .01" /><path d="M14 10l0 .01" /><path d="M18 10l0 .01" /><path d="M6 14l0 .01" /><path d="M18 14l0 .01" /><path d="M10 14l4 .01" /></>); // tabler: keyboard
export const MousePointer2 = icon(<><path d="M7.904 17.563a1.2 1.2 0 0 0 2.228 .308l2.09 -3.093l4.907 4.907a1.067 1.067 0 0 0 1.509 0l1.047 -1.047a1.067 1.067 0 0 0 0 -1.509l-4.907 -4.907l3.113 -2.09a1.2 1.2 0 0 0 -.309 -2.228l-13.582 -3.904l3.904 13.563" /></>); // tabler: pointer
export const Hand = icon(<><path d="M8 13v-7.5a1.5 1.5 0 0 1 3 0v6.5" /><path d="M11 5.5v-2a1.5 1.5 0 1 1 3 0v8.5" /><path d="M14 5.5a1.5 1.5 0 0 1 3 0v6.5" /><path d="M17 7.5a1.5 1.5 0 0 1 3 0v8.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7a69.74 69.74 0 0 1 -.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47" /></>); // tabler: hand-stop
export const ScanSearch = icon(<><path d="M8 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /><path d="M16 16l-2.5 -2.5" /><path d="M3 7v-2a2 2 0 0 1 2 -2h2" /><path d="M3 17v2a2 2 0 0 0 2 2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M17 21h2a2 2 0 0 0 2 -2v-2" /></>); // tabler: zoom-scan
export const Spotlight = icon(<><path d="M4 8v-2a2 2 0 0 1 2 -2h2" /><path d="M4 16v2a2 2 0 0 0 2 2h2" /><path d="M16 4h2a2 2 0 0 1 2 2v2" /><path d="M16 20h2a2 2 0 0 0 2 -2v-2" /><path d="M9 9m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" /></>); // tabler: focus-centered style
export const Square = icon(<><path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14" /></>); // tabler: square
export const Diamond = icon(<><path d="M13.446 2.6l7.955 7.954a2.045 2.045 0 0 1 0 2.892l-7.955 7.955a2.045 2.045 0 0 1 -2.892 0l-7.955 -7.955a2.045 2.045 0 0 1 0 -2.892l7.955 -7.955a2.045 2.045 0 0 1 2.892 0" /></>); // tabler: square-rotated
export const Circle = icon(<><path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /></>); // tabler: circle
export const MoveUpRight = icon(<><path d="M17 7l-10 10" /><path d="M8 7l9 0l0 9" /></>); // tabler: arrow-up-right
export const Minus = icon(<><path d="M5 12l14 0" /></>); // tabler: minus
export const Pencil = icon(<><path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" /><path d="M13.5 6.5l4 4" /></>); // tabler: pencil
export const Type = icon(<><path d="M4 20l3 0" /><path d="M14 20l7 0" /><path d="M6.9 15l6.9 0" /><path d="M10.2 6.3l5.8 13.7" /><path d="M5 20l6 -16l2 0l7 16" /></>); // tabler: typography
export const ListOrdered = icon(<><path d="M11 6h9" /><path d="M11 12h9" /><path d="M12 18h8" /><path d="M4 16a2 2 0 1 1 4 0c0 .591 -.5 1 -1 1.5l-3 2.5h4" /><path d="M6 10v-6l-2 2" /></>); // tabler: list-numbers
export const Highlighter = icon(<><path d="M3 19h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" /><path d="M12.5 5.5l4 4" /><path d="M4.5 13.5l4 4" /><path d="M21 15v4h-8l4 -4l4 0" /></>); // tabler: highlight
export const Droplets = icon(<><path d="M12 21a9.01 9.01 0 0 0 2.32 -.302a9 9 0 0 0 1.74 -16.733a9 9 0 1 0 -4.06 17.035" /><path d="M12 3v17" /><path d="M12 12h9" /><path d="M12 9h8" /><path d="M12 6h6" /><path d="M12 18h6" /><path d="M12 15h8" /></>); // tabler: blur
export const Grid3x3 = icon(<><path d="M4 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M11 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M18 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M4 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M18 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M4 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M11 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M18 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /></>); // tabler: grid-dots
export const Crop = icon(<><path d="M8 5v10a1 1 0 0 0 1 1h10" /><path d="M5 8h10a1 1 0 0 1 1 1v10" /></>); // tabler: crop
export const Eraser = icon(<><path d="M19 20h-10.5l-4.21 -4.3a1 1 0 0 1 0 -1.41l10 -10a1 1 0 0 1 1.41 0l5 5a1 1 0 0 1 0 1.41l-9.2 9.3" /><path d="M18 13.3l-6.3 -6.3" /></>); // tabler: eraser
export const ImageOff = icon(<><path d="M15 8h.01" /><path d="M7 3h11a3 3 0 0 1 3 3v11m-.856 3.099a2.991 2.991 0 0 1 -2.144 .901h-12a3 3 0 0 1 -3 -3v-12c0 -.845 .349 -1.608 .91 -2.153" /><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" /><path d="M16.33 12.338c.574 -.054 1.155 .166 1.67 .662l3 3" /><path d="M3 3l18 18" /></>); // tabler: photo-off
export const RotateCcw = icon(<><path d="M19.95 11a8 8 0 1 0 -.5 4m.5 5v-5h-5" /></>); // tabler: rotate
export const Maximize2 = icon(<><path d="M16 4l4 0l0 4" /><path d="M14 10l6 -6" /><path d="M8 20l-4 0l0 -4" /><path d="M4 20l6 -6" /><path d="M16 20l4 0l0 -4" /><path d="M14 14l6 6" /><path d="M8 4l-4 0l0 4" /><path d="M4 4l6 6" /></>); // tabler: arrows-maximize
export const Trash2 = icon(<><path d="M4 7l16 0" /><path d="M10 11l0 6" /><path d="M14 11l0 6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></>); // tabler: trash
export const Sun = icon(<><path d="M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /><path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7" /></>); // tabler: sun
export const Moon = icon(<><path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454l0 .008" /></>); // tabler: moon
export const Monitor = icon(<><path d="M3 5a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-10" /><path d="M7 20h10" /><path d="M9 16v4" /><path d="M15 16v4" /></>); // tabler: device-desktop
export const Search = icon(<><path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M21 21l-6 -6" /></>); // tabler: search
export const ImagePlus = icon(<><path d="M15 8h.01" /><path d="M12.5 21h-6.5a3 3 0 0 1 -3 -3v-12a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v6.5" /><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l4 4" /><path d="M14 14l1 -1c.67 -.644 1.45 -.824 2.182 -.54" /><path d="M16 19h6" /><path d="M19 16v6" /></>); // tabler: photo-plus
export const ScanText = icon(<><path d="M8 12h8" /><path d="M8 9h6" /><path d="M8 15h4" /><path d="M3 7v-2a2 2 0 0 1 2 -2h2" /><path d="M3 17v2a2 2 0 0 0 2 2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M17 21h2a2 2 0 0 0 2 -2v-2" /></>); // tabler: text-scan-2
export const Save = icon(<><path d="M6 4h10l4 4v10a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2" /><path d="M10 14a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M14 4l0 4l-6 0l0 -4" /></>); // tabler: device-floppy
export const FileJson = icon(<><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2" /><path d="M10 13l-1 2l1 2" /><path d="M14 13l1 2l-1 2" /></>); // tabler: file-code
export const Lock = icon(<><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6" /><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" /><path d="M8 11v-4a4 4 0 1 1 8 0v4" /></>); // tabler: lock
export const Unlock = icon(<><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2l0 -6" /><path d="M11 16a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M8 11v-5a4 4 0 0 1 8 0" /></>); // tabler: lock-open
export const MessageCircle = icon(<><path d="M3 20l1.3 -3.9c-2.324 -3.437 -1.426 -7.872 2.1 -10.374c3.526 -2.501 8.59 -2.296 11.845 .48c3.255 2.777 3.695 7.266 1.029 10.501c-2.666 3.235 -7.615 4.215 -11.574 2.293l-4.7 1" /></>); // tabler: message-circle
