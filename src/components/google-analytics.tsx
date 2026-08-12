'use client';

import { Suspense, useEffect, useState } from 'react';
import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { GA_MEASUREMENT_ID, trackPageView } from '@/lib/analytics';

/**
 * Analytics consent, stored in localStorage, default ON, switchable in
 * Settings. GA only ever collects anonymous page views - images and
 * annotations never leave the device.
 */
export function readAnalyticsConsent(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem('snapty-analytics') !== 'off';
  } catch {
    return true;
  }
}

export function setAnalyticsConsent(on: boolean) {
  try {
    localStorage.setItem('snapty-analytics', on ? 'on' : 'off');
  } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event('snapty-analytics-change'));
}

function RouteChangeTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams.toString();
    trackPageView(qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, searchParams]);

  return null;
}

/** Loads gtag.js only when the user has analytics enabled. */
export default function GoogleAnalytics() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    const sync = () => setEnabled(readAnalyticsConsent());
    sync();
    window.addEventListener('snapty-analytics-change', sync);
    return () => window.removeEventListener('snapty-analytics-change', sync);
  }, []);

  if (!GA_MEASUREMENT_ID) return null;
  // Wait for hydration so the consent decision is read before any tag loads.
  if (enabled === null) return null;
  if (!enabled) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="snapty-google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: true, anonymize_ip: true });
        `}
      </Script>
      <Suspense fallback={null}>
        <RouteChangeTracker />
      </Suspense>
    </>
  );
}
