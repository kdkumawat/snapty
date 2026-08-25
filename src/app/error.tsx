'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

/**
 * Top-level error boundary. Logs to console so devs see the original stack;
 * offers two recovery paths: reload (same page) or back to the landing.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  useEffect(() => {
    console.error('App error boundary caught:', error);
  }, [error]);

  return (
    <main
      id="main-content"
      className="flex flex-1 items-center justify-center p-6 text-foreground"
    >
      <div className="max-w-sm w-full text-center space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The page hit an unexpected error. Your work-in-progress is preserved locally
          and will be offered again on the next reload.
        </p>
        {error.digest && (
          <p className="text-[10px] font-mono text-muted-foreground/70">
            error: {error.digest}
          </p>
        )}
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button variant="outline" onClick={() => reset()}>
            Try again
          </Button>
          <Button onClick={() => router.push('/')}>Back to home</Button>
        </div>
      </div>
    </main>
  );
}
