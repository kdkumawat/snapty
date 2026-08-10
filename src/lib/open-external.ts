import { isStandalonePwa } from '@/store/editor-store';

/**
 * Open an in-app path in a normal browser tab when possible.
 * PWAs with handle_links=preferred trap same-origin links; we use an absolute
 * URL + target=_blank and not-preferred in the manifest so /info opens outside
 * the installed shell on supporting browsers.
 */
export function openInBrowser(path: string): void {
  const url = new URL(path, window.location.href).href;
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  // Popup blockers return null; same-tab fallback still beats a trapped PWA nav.
  if (!opened && isStandalonePwa()) {
    window.location.assign(url);
  }
}
