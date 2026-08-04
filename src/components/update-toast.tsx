'use client';

import React, { useEffect, useState } from 'react';
import { X, RefreshCw } from 'lucide-react';

export default function UpdateToast() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let sw: ServiceWorker | null = null;
    let refreshing = false;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        sw = reg;
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
              setShow(true);
            }
          });
        });
      }).catch(() => {});
    }

    // Handle controller change (new SW took over)
    const handleControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker?.addEventListener('controllerchange', handleControllerChange);

    return () => {
      navigator.serviceWorker?.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  const handleRefresh = () => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  };

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
