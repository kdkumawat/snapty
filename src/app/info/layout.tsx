import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Snapty is a free browser screenshot editor. Annotate with hand-drawn arrows, shapes, blur, and text. Privacy-first and installable as a PWA.',
  openGraph: {
    title: 'About Snapty: Free Browser Screenshot Editor',
    description:
      'Learn how Snapty helps you annotate screenshots locally with a hand-drawn feel.',
  },
};

export default function InfoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
