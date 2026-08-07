'use client';

import dynamic from 'next/dynamic';

const LandingPage = dynamic(() => import('@/components/landing/landing-page'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-canvas">
      <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
    </div>
  ),
});

export default function InfoPage() {
  return <LandingPage />;
}
