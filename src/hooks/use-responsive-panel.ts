'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useEditorStore } from '@/store/editor-store';

/**
 * Production-style responsive settings rail:
 * - Auto-collapses on narrow widths, auto-expands on wide widths
 * - Hysteresis (dead zone) prevents thrashing while resizing
 * - Manual open/close is respected until the viewport "releases" the pin
 *   (wide enough after force-close, or narrow enough after force-open)
 */

const COLLAPSE_BELOW = 900;
const EXPAND_ABOVE = 1120;
const PIN_KEY = 'snapty-panel-pin'; // 'open' | 'closed' | absent = auto

type Pin = 'open' | 'closed' | null;

function readPin(): Pin {
  try {
    const v = sessionStorage.getItem(PIN_KEY);
    if (v === 'open' || v === 'closed') return v;
  } catch { /* private mode */ }
  return null;
}

function writePin(pin: Pin) {
  try {
    if (!pin) sessionStorage.removeItem(PIN_KEY);
    else sessionStorage.setItem(PIN_KEY, pin);
  } catch { /* ignore */ }
}

function naturalCollapsed(width: number, current: boolean): boolean {
  if (width < COLLAPSE_BELOW) return true;
  if (width > EXPAND_ABOVE) return false;
  return current; // dead zone - keep current
}

export function useResponsivePanel() {
  const panelCollapsed = useEditorStore((s) => s.panelCollapsed);
  const setPanelCollapsed = useEditorStore((s) => s.setPanelCollapsed);
  const pinRef = useRef<Pin>(null);
  const widthRef = useRef(typeof window !== 'undefined' ? window.innerWidth : EXPAND_ABOVE);

  // Init pin from session
  useEffect(() => {
    pinRef.current = readPin();
  }, []);

  const applyResponsive = useCallback(() => {
    if (typeof window === 'undefined') return;
    const width = window.innerWidth;
    widthRef.current = width;
    const current = useEditorStore.getState().panelCollapsed;
    let pin = pinRef.current;

    // Release pin when viewport strongly contradicts the forced state
    if (pin === 'closed' && width > EXPAND_ABOVE) {
      pin = null;
      pinRef.current = null;
      writePin(null);
    } else if (pin === 'open' && width < COLLAPSE_BELOW) {
      pin = null;
      pinRef.current = null;
      writePin(null);
    }

    let next: boolean;
    if (pin === 'open') next = false;
    else if (pin === 'closed') next = true;
    else next = naturalCollapsed(width, current);

    if (next !== current) {
      // Auto updates must not write localStorage pin / fight user - use silent set
      useEditorStore.setState({ panelCollapsed: next });
      window.dispatchEvent(new Event('snapty-panel-change'));
    }
  }, []);

  useEffect(() => {
    applyResponsive();
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(applyResponsive);
    };
    window.addEventListener('resize', onResize, { passive: true });
    // visualViewport covers mobile chrome show/hide and some PWA resizes
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, [applyResponsive]);

  /** User toggled the rail - pin until viewport releases it */
  const togglePanel = useCallback((collapsed?: boolean) => {
    const current = useEditorStore.getState().panelCollapsed;
    const next = collapsed ?? !current;
    const pin: Pin = next ? 'closed' : 'open';
    pinRef.current = pin;
    writePin(pin);
    setPanelCollapsed(next);
    window.dispatchEvent(new Event('snapty-panel-change'));
  }, [setPanelCollapsed]);

  return {
    panelCollapsed,
    togglePanel,
    expandPanel: () => togglePanel(false),
    collapsePanel: () => togglePanel(true),
  };
}
