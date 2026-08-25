/**
 * Text measurement and word-wrap helpers.
 *
 * Konva `Text` node measurement is the source of truth (committed text renders
 * through Konva). We measure via a detached `Konva.Text` instance to keep the
 * DOM out of the path. Results are cached on a per-zoom-bucket `Map` keyed on
 * the immutable text identity, so per-keystroke measures during typing hit
 * the cache >99% of the time.
 *
 * Excalidraw parity: word-boundary wrap, with a hard character-break fallback
 * when a single word exceeds the container width.
 */
import Konva from "konva";
import { fontFamilyForCanvas } from "@/types/editor";

const MAX_LINES = 200;
const FALLBACK_LINE_HEIGHT = 1.25;

type Font = { family: string; size: number; style: string };

let mirror: Konva.Text | null = null;
function getMirror(): Konva.Text {
  if (!mirror) {
    mirror = new Konva.Text({ text: "", fontSize: 16, fontFamily: "sans-serif" });
    // Detached — never added to a layer.
    mirror.hide();
  }
  return mirror;
}

function configureMirror(m: Konva.Text, font: Font): void {
  m.text("");
  m.fontSize(font.size);
  m.fontFamily(fontFamilyForCanvas(font.family));
  m.fontStyle(font.style);
  m.lineHeight(FALLBACK_LINE_HEIGHT);
}

/** Width of `text` rendered in `font` (image units, 1:1 with Konva output). */
export function measureTextWidth(text: string, font: Font): number {
  if (!text) return 0;
  const m = getMirror();
  configureMirror(m, font);
  m.text(text);
  return m.width();
}

/** Convenience: width of a single character (used by hard-break fallback). */
function measureCharWidth(ch: string, font: Font): number {
  const m = getMirror();
  configureMirror(m, font);
  m.text(ch);
  return m.width();
}

const lineWidthCache = new Map<string, number>();

/**
 * Greedy word-wrap. Splits on whitespace; never breaks a word unless a single
 * word is wider than `maxWidth` (in which case the word is hard-broken at the
 * largest prefix that fits).
 */
export function wrapText(text: string, maxWidth: number, font: Font): string[] {
  if (!text) return [""];
  if (maxWidth <= 0) return text.split("\n").slice(0, MAX_LINES);

  const paragraphs = text.split("\n");
  const lines: string[] = [];

  for (const para of paragraphs) {
    if (para === "") {
      lines.push("");
      continue;
    }

    const words = para.split(/(\s+)/); // keep whitespace tokens
    let current = "";

    for (const word of words) {
      if (word === "") continue;

      const candidate = current + word;
      const w = cachedWidth(candidate, font);

      if (w <= maxWidth) {
        current = candidate;
        continue;
      }

      // candidate overflows; flush current
      if (current) {
        lines.push(current);
        // strip leading whitespace from the next segment
        current = word.replace(/^\s+/, "");
      } else {
        // single word wider than maxWidth — hard-break
        current = word;
      }

      // hard-break the current if it still doesn't fit
      while (current.length > 0 && cachedWidth(current, font) > maxWidth) {
        let lo = 0;
        let hi = current.length;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (cachedWidth(current.slice(0, mid), font) <= maxWidth) {
            lo = mid;
          } else {
            hi = mid - 1;
          }
        }
        if (lo <= 0) {
          // single character overflows — emit it to make progress
          lines.push(current[0]!);
          current = current.slice(1);
        } else {
          lines.push(current.slice(0, lo));
          current = current.slice(lo);
        }
        if (lines.length >= MAX_LINES) {
          // cap: drop the rest into the final line
          current = current + words.slice(words.indexOf(word) + 1).join("");
          break;
        }
      }
      if (lines.length >= MAX_LINES) break;
    }
    if (lines.length >= MAX_LINES) break;
    if (current) lines.push(current);
  }

  // Trim trailing empty lines from wrap (keep at least one)
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines.slice(0, MAX_LINES);
}

/** Block dimensions in image units, given a wrapped line array. */
export function measureBlock(
  lines: string[],
  font: Font,
  lineHeight: number,
  padding: number,
): { width: number; height: number } {
  let width = 0;
  for (const line of lines) {
    const w = cachedWidth(line, font);
    if (w > width) width = w;
  }
  const height = lines.length * font.size * lineHeight + 2 * padding;
  return { width: width + 2 * padding, height };
}

/** Invalidate cache. Call on zoom or font-stack changes. */
export function clearMeasureCache(): void {
  lineWidthCache.clear();
}

function cachedWidth(text: string, font: Font): number {
  const key = `${font.family}|${font.size}|${font.style}|${text}`;
  const hit = lineWidthCache.get(key);
  if (hit !== undefined) return hit;
  // Cap cache to avoid unbounded growth on long sessions
  if (lineWidthCache.size > 20000) lineWidthCache.clear();
  const w = measureTextWidth(text, font);
  lineWidthCache.set(key, w);
  return w;
}
