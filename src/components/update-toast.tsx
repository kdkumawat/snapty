'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { X, RefreshCw } from 'lucide-react';

export default function UpdateToast() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let isMounted = true;
    const showToast = () => {
      if (isMounted) setShow(true);
    };

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

        if (registration.waiting) {
          showToast();
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' || newWorker.state === 'activated') {
              showToast();
            }
          });
        });

        await registration.update();
        if (registration.waiting) {
          showToast();
        }
      } catch {
        // Ignore registration failures; the app can still run without the update prompt.
      }
    };

    const handleControllerChange = () => {
      window.location.reload();
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NEW_VERSION_READY') {
        showToast();
      }
    };

    void registerServiceWorker();
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    navigator.serviceWorker.addEventListener('message', handleMessage);

    return () => {
      isMounted = false;
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, []);

  const handleRefresh = useCallback(() => {
    setShow(false);
    const refreshApp = () => window.location.reload();

    navigator.serviceWorker.getRegistration().then((registration) => {
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
      }
      window.setTimeout(refreshApp, 250);
    }).catch(() => {
      refreshApp();
    });
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] bg-accent text-accent-foreground px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-3 text-sm font-medium animate-in fade-in-0 slide-in-from-bottom-4">
      <span>A new version is available</span>
      <button onClick={handleRefresh} className="inline-flex items-center gap-1.5 bg-white/20 hover:bg-white/30 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer">
        <RefreshCw className="w-3 h-3" />Refresh
      </button>
      <button onClick={() => setShow(false)} className="p-0.5 hover:bg-white/20 rounded transition-colors cursor-pointer">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
