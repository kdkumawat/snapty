'use client';

import { useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';

/**
 * Production-grade "new version available" prompt.
 *
 * Detection: poll /version.json (a tiny static asset written at build time by
 * scripts/write-version.mjs) on mount and whenever the tab regains focus. The
 * first sha the user ever sees is recorded in localStorage; any later sha that
 * differs triggers exactly one toast until the user reloads.
 *
 * Compared to the previous service-worker-driven approach this is:
 *   - Reliable on Cloudflare Pages (no SW cache racing the deploy)
 *   - Cheap (one ~40-byte JSON fetch per focus, no interval)
 *   - Work-loss safe (the toast offers a Reload button instead of auto-reload)
 */

const VERSION_URL = '/version.json';
const SEEN_KEY = 'snapty-seen-version';
const POLL_DELAY_MS = 1500;

type VersionPayload = { sha?: string; builtAt?: string };

function isVersionPayload(v: unknown): v is VersionPayload {
  return !!v && typeof v === 'object' && 'sha' in v;
}

export default function UpdateToast() {
  // Track which sha we already announced so polling doesn't fire duplicate
  // toasts, and which sha is the user's "last seen" baseline.
  const announcedShaRef = useRef<string | null>(null);
  const seenBaselineRef = useRef<string | null>(null);
  const initialCheckDoneRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;
    const seenRaw = (() => {
      try { return window.localStorage.getItem(SEEN_KEY); } catch { return null; }
    })();
    seenBaselineRef.current = seenRaw;
    announcedShaRef.current = seenRaw;

    const checkForUpdate = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(VERSION_URL, { cache: 'no-store' });
        if (!res.ok) return;
        const data: unknown = await res.json();
        if (!isVersionPayload(data) || !data.sha) return;
        const serverSha = data.sha;

        // First observation on this device: just record the baseline so the
        // very first load after a deploy never spuriously toasts.
        if (!initialCheckDoneRef.current) {
          initialCheckDoneRef.current = true;
          seenBaselineRef.current = serverSha;
          announcedShaRef.current = serverSha;
          try { window.localStorage.setItem(SEEN_KEY, serverSha); } catch { /* ignore */ }
          return;
        }

        if (serverSha === announcedShaRef.current) return;
        announcedShaRef.current = serverSha;
        // Persist the new baseline immediately so re-focuses don't re-fire.
        try { window.localStorage.setItem(SEEN_KEY, serverSha); } catch { /* ignore */ }

        toast({
          title: 'Update available',
          description: 'A new version of Snapty is ready. Reload to get the latest.',
          duration: Number.POSITIVE_INFINITY,
          action: (
            <ToastAction
              altText="Reload to update"
              onClick={() => {
                // Bust the static asset cache so the reload actually fetches
                // the new HTML bundle instead of a Cloudflare-cached copy.
                window.location.reload();
              }}
              className="gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reload
            </ToastAction>
          ),
        });
      } catch {
        // Network failure or parse error — try again on next focus.
      }
    };

    // Tiny delay lets the page reach `complete` so the very first poll doesn't
    // race the prebuild-written version.json when running `next dev`.
    const initialTimer = window.setTimeout(checkForUpdate, POLL_DELAY_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void checkForUpdate();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
    };
  }, []);

  return null;
}
