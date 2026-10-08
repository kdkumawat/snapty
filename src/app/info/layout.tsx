import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Snapty is the fastest way to mark up a screenshot: arrows, numbered steps, callouts, blur and spotlight. Free, no account, nothing uploaded.',
  openGraph: {
    title: 'About Snapty',
    description:
      'Point at exactly what you mean. Nothing is uploaded. Your screenshots stay on your device.',
  },
};

export default function InfoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
